"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isResearchableStock, type ChatMessage, type Mode, type ResearchEvent } from "@/lib/types";
import { buildClaudePrompt, claudeUrl } from "@/lib/handoff";
import TopBar from "@/components/TopBar";
import AppSidebar from "@/components/AppSidebar";
import Composer from "@/components/Composer";
import { MessageView, Thinking } from "@/components/Messages";
import AgentRoom from "@/components/AgentRoom";
import { ConnectionsView, DailyView, OverviewView, RulesView, type ViewProps } from "@/components/Sections";
import { api, streamApi, type AppState } from "@/components/format";
import { Button } from "@/components/ui";
import { XIcon } from "@/components/icons";
import { VIEWS, viewFromHash } from "@/components/views";

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

type FeedFilter = "all" | "decide" | "research" | "daily";

function matchesFilter(m: ChatMessage, filter: FeedFilter): boolean {
  if (filter === "decide") return m.kind === "constraint" && !m.resolved;
  if (filter === "research") return m.kind === "research" || m.kind === "scenario";
  if (filter === "daily") return m.kind === "daily";
  return true;
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Actions post their cards in the feed, so show the feed when one starts. */
function showFeed() {
  if (viewFromHash(window.location.hash) !== "feed") window.location.hash = "feed";
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<ChatMessage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** What the research agents are saying right now (streamed from the server) */
  const [liveEvents, setLiveEvents] = useState<ResearchEvent[]>([]);
  /** The feed has its own scroll area; new cards scroll it to the end. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  /** The "Ask Atlas" box under the feed; the header button focuses it. */
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusComposer = useRef(false);

  // Which section is showing comes from the URL hash; the sidebar is open on wide windows and an overlay on narrow ones.
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  const view = viewFromHash(hash);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const closeMobileMenu = useCallback(() => setMobileMenu(false), []);
  const toggleSidebar = () => {
    if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen((o) => !o);
    else setMobileMenu((o) => !o);
  };

  const refresh = useCallback(async () => {
    try {
      const s = await api<AppState>("/api/state");
      setState(s);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    refresh();
    const url = new URL(window.location.href);
    if (url.searchParams.get("connected")) {
      setNotice("Brokerage connected through SnapTrade. Atlas can now see your real holdings.");
      url.searchParams.delete("connected");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [refresh]);

  // The Atlas Chrome extension runs Claude Deep Research in another tab and reports back with these events.
  useEffect(() => {
    const started = (e: Event) => {
      const t = (e as CustomEvent<{ ticker?: string }>).detail?.ticker || "this stock";
      setNotice(`Claude opened in a new tab with Research mode on and the prompt filled in for ${t}. Press send there and the card will appear here when it finishes.`);
    };
    const imported = (e: Event) => {
      const t = (e as CustomEvent<{ ticker?: string }>).detail?.ticker || "your stock";
      setNotice(`Claude’s Deep Research on ${t} is in. See the card in the agent feed.`);
      refresh();
    };
    const progress = (e: Event) => {
      const d = (e as CustomEvent<{ ticker?: string; text?: string }>).detail;
      if (d?.text) setNotice(`Claude${d.ticker ? ` · ${d.ticker}` : ""}: ${d.text}`);
    };
    const failed = (e: Event) => setError((e as CustomEvent<{ error?: string }>).detail?.error ?? "Claude Deep Research didn’t finish.");
    window.addEventListener("atlas:claude-started", started);
    window.addEventListener("atlas:imported", imported);
    window.addEventListener("atlas:claude-status", progress);
    window.addEventListener("atlas:claude-error", failed);
    return () => {
      window.removeEventListener("atlas:claude-started", started);
      window.removeEventListener("atlas:imported", imported);
      window.removeEventListener("atlas:claude-status", progress);
      window.removeEventListener("atlas:claude-error", failed);
    };
  }, [refresh]);

  // Deep research posts cards while it runs (a portfolio review posts one per stock), so poll while busy.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [busy, refresh]);

  // Scheduled daily runs post cards without a click, so quietly check for them (never while the tab is hidden).
  const dailyRunning = Boolean(state?.daily?.running);
  useEffect(() => {
    if (busy) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, dailyRunning ? 6000 : 30000);
    return () => clearInterval(id);
  }, [busy, dailyRunning, refresh]);

  // The feed is newest first, so new cards and the live agent room appear at the top.
  const messageCount = state?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [view, filter, messageCount, busy, pendingUser]);

  // "Ask Atlas" in the header: go to the feed and put the cursor in the box.
  useEffect(() => {
    if (view === "feed" && focusComposer.current) {
      focusComposer.current = false;
      composerRef.current?.focus();
    }
  }, [view]);
  const askAtlas = () => {
    if (view === "feed") composerRef.current?.focus();
    else {
      focusComposer.current = true;
      window.location.hash = "feed";
    }
  };

  /** Run a slow agent action with a calm progress label, then refetch. */
  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      showFeed();
      setBusy(label);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPendingUser(null);
        await refresh();
        setBusy(null);
      }
    },
    [refresh],
  );

  // The what-if agent runs in stages; show which stage is likely running so the wait feels explained.
  const stageTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearStageTimers = () => {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
  };
  useEffect(() => clearStageTimers, []);

  const whatIf = (scenario: string) => {
    setPendingUser({ id: "pending", kind: "user", text: `What if: ${scenario}`, createdAt: new Date().toISOString() });
    clearStageTimers();
    stageTimers.current = [
      setTimeout(() => setBusy("Researcher agents are reading news and government notices…"), 8000),
      setTimeout(() => setBusy("Synthesizer is mapping it onto your stocks…"), 25000),
    ];
    run("Planner is breaking the scenario into ways it could spread…", async () => {
      try {
        await api("/api/scenario", { scenario });
      } finally {
        clearStageTimers();
      }
    });
  };

  /** Sector research runs on the what-if agents: they read what is happening in the sector and map it onto the user's stocks. */
  const sector = (name: string) => {
    setPendingUser({ id: "pending", kind: "user", text: `Research the ${name} sector`, createdAt: new Date().toISOString() });
    run(`Reading news and government notices about ${name}…`, () =>
      api("/api/scenario", {
        scenario: `Recent developments in the ${name} sector: what is happening in it right now, and what does it mean for my stocks?`,
      }),
    );
  };

  const scan = () => run("Reading filings, news and government notices…", () => api("/api/scan", {}));

  /** Run research that streams the agents' conversation into the live agent room. */
  const streamResearch = (label: string, path: string, body: unknown) =>
    run(label, async () => {
      setLiveEvents([]);
      try {
        await streamApi<ResearchEvent>(path, body, (e) => setLiveEvents((prev) => [...prev, e]));
      } finally {
        setLiveEvents([]);
      }
    });

  const research = (ticker: string) =>
    streamResearch(`${ticker}: 4 analyst agents are reading SEC filings, news and government notices…`, "/api/research", { ticker });

  // One request per stock, so a long review never depends on a single connection staying open for minutes.
  const review = () =>
    run("Reviewing your biggest holdings one by one…", async () => {
      const { picks } = await api<{ picks: string[] }>("/api/review", { step: "start" });
      setLiveEvents([]);
      try {
        for (const [i, ticker] of picks.entries()) {
          setBusy(`Reviewing ${ticker} (${i + 1} of ${picks.length})…`);
          try {
            await streamApi<ResearchEvent>("/api/research", { ticker, review: { index: i, count: picks.length } }, (e) => setLiveEvents((prev) => [...prev, e]));
          } catch {
            // One stock failing doesn't stop the review; the summary says which one didn't finish.
          }
          await refresh();
        }
      } finally {
        setLiveEvents([]);
      }
      if (picks.length) await api("/api/review", { step: "finish", tickers: picks });
    });

  const runDaily = () =>
    streamResearch("Daily run: checking your portfolio and researching…", "/api/daily/run", {});

  const importReport = async (text: string) => {
    await api("/api/import", { text });
    await refresh();
  };

  /** Prompt link for Claude Deep Research on any ticker, with the user's position filled in. */
  const claudeLinkFor = (ticker: string) => {
    const holding = state?.portfolio?.holdings.find((h) => h.ticker === ticker);
    return claudeUrl(buildClaudePrompt({ ticker, name: holding?.name, holding, portfolioTotal: state?.portfolio?.total }));
  };

  /** Prompt link for Claude Deep Research on a whole sector, with the user's tickers so Claude can relate it to them. */
  const claudeSectorLinkFor = (name: string) => {
    const held = state?.portfolio?.holdings.map((h) => h.ticker).join(", ");
    return claudeUrl(
      `Do deep research on the ${name} sector for a beginner investor. Cover what is driving the sector right now, the biggest risks, any upcoming regulation or government action, and the five most important companies with one line on each. ` +
        (held ? `I hold ${held}; say plainly how this sector affects those positions. ` : "") +
        "Use recent primary sources (SEC filings, government notices, company reports) and cite them. Use plain words and explain any jargon. This is research, not financial advice.",
    );
  };

  const choose = async (messageId: string, optionIndex: number) => {
    setBusy("Working on it…");
    setError(null);
    let next: { research?: string } | undefined;
    try {
      ({ next } = await api<{ next?: { research?: string } }>("/api/action", { messageId, optionIndex }));
    } finally {
      await refresh();
      setBusy(null);
    }
    // Research chosen on a card runs through the live agent room.
    if (next?.research) research(next.research);
  };

  const switchMode = async (mode: Mode, confirm?: string) => {
    const res = await api<{ ok: boolean; error?: string }>("/api/mode", { mode, confirm });
    if (res && res.ok === false) throw new Error(res.error ?? "Couldn’t switch mode.");
    await refresh();
  };

  const mutate = async (path: string, body: unknown) => {
    setError(null);
    try {
      await api(path, body);
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
  };

  const reset = async () => {
    if (busy) return;
    await mutate("/api/reset", {});
    setNotice(null);
  };

  if (!state) {
    return (
      <main className="atlas-wash grid flex-1 place-items-center p-8 text-center">
        {loadError ? (
          <div className="max-w-md space-y-3">
            <p className="font-semibold">Atlas couldn’t load.</p>
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : (
          <Thinking label="Loading Atlas…" />
        )}
      </main>
    );
  }

  const messages = state.messages;
  const openDecisions = messages.filter((m) => m.kind === "constraint" && !m.resolved).length;
  const meta = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const isBusy = Boolean(busy);

  // Open decisions first, then everything else, newest first within each.
  const newestFirst = [...messages].reverse();
  const isOpenDecision = (m: ChatMessage) => m.kind === "constraint" && !m.resolved;
  const toDecide = filter === "all" || filter === "decide" ? newestFirst.filter(isOpenDecision) : [];
  const activity = filter === "decide" ? [] : newestFirst.filter((m) => !isOpenDecision(m) && matchesFilter(m, filter));

  const viewProps: ViewProps = {
    state,
    busy: isBusy,
    onResearch: research,
    onScan: scan,
    onReview: review,
    onRunDaily: runDaily,
    onSetDaily: (patch) => mutate("/api/daily", { ...patch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onImport: importReport,
    onSetInterests: (interests) => mutate("/api/interests", { interests }),
    onDeleteRule: (id) => mutate("/api/rules", { action: "delete", id }),
    onSelectAccount: (accountId) => mutate("/api/account", { accountId }),
    onSwitchMode: switchMode,
    onReset: reset,
    onSignOut: async () => {
      await api("/api/logout", {}).catch(() => undefined);
      window.location.replace("/login");
    },
  };

  const BANNER = "glass flex items-start justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm";
  const banners = (
    <>
      {busy && view !== "feed" && (
        <div className={BANNER} role="status">
          <Thinking label={busy} />
        </div>
      )}
      {error && (
        <div className={`${BANNER} border-destructive/40`} role="alert">
          <span>
            <span className="font-semibold text-destructive">That didn’t work.</span> {error}
          </span>
          <Button variant="ghost" size="xs" onClick={() => setError(null)} aria-label="Dismiss" className="px-1">
            <XIcon />
          </Button>
        </div>
      )}
      {notice && (
        <div className={BANNER} role="status">
          <span>{notice}</span>
          <Button variant="ghost" size="xs" onClick={() => setNotice(null)} aria-label="Dismiss" className="px-1">
            <XIcon />
          </Button>
        </div>
      )}
    </>
  );

  const filters: { id: FeedFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "decide", label: `Needs your decision (${openDecisions})` },
    { id: "research", label: "Research" },
    { id: "daily", label: "Daily" },
  ];

  const SECTION = "px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase";

  return (
    <div data-slot="sidebar-wrapper" className="atlas-wash flex h-dvh w-full overflow-hidden">
      <AppSidebar view={view} openDecisions={openDecisions} open={sidebarOpen} mobileOpen={mobileMenu} onCloseMobile={closeMobileMenu} />
      <div
        data-slot="sidebar-inset"
        className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-white/[0.015] md:my-2 md:mr-2 md:rounded-3xl md:border md:border-white/[0.08] ${sidebarOpen ? "" : "md:ml-2"}`}
      >
        <TopBar title={meta.title} description={meta.description} mode={state.mode} onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} onAsk={askAtlas} />

        {view === "feed" ? (
          <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden">
            <div className="shrink-0 px-3 pt-3 sm:px-5">
              <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5" role="group" aria-label="Show in the feed">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`h-7 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                      filter === f.id
                        ? "border-white/20 bg-white/[0.12] text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={scrollRef} className="mt-3 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 sm:px-5" aria-live="polite">
              <section aria-label="Agent feed" className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3 pt-2 pb-6">
                {banners}

                {/* What is happening right now sits on top, where new cards will land. */}
                {pendingUser && <MessageView m={pendingUser} onChoose={choose} busy={isBusy} />}
                {busy && (liveEvents.length > 0 ? <AgentRoom events={liveEvents} live /> : <div className="px-1 py-2"><Thinking label={busy} /></div>)}

                {toDecide.length > 0 && (
                  <>
                    <h2 className={`${SECTION} mt-2 text-foreground`}>Needs your decision · {toDecide.length}</h2>
                    {toDecide.map((m) => (
                      <MessageView key={m.id} m={m} onChoose={choose} busy={isBusy} />
                    ))}
                  </>
                )}

                {activity.length > 0 && (
                  <>
                    <h2 className={`${SECTION} mt-3`}>Activity</h2>
                    {activity.map((m, i) => {
                      const newDay = i > 0 && dayKey(activity[i - 1].createdAt) !== dayKey(m.createdAt);
                      return (
                        <Fragment key={m.id}>
                          {newDay && (
                            <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground" role="separator">
                              <span className="h-px flex-1 bg-white/[0.08]" />
                              {dayLabel(m.createdAt)}
                              <span className="h-px flex-1 bg-white/[0.08]" />
                            </div>
                          )}
                          <MessageView m={m} onChoose={choose} busy={isBusy} />
                        </Fragment>
                      );
                    })}
                  </>
                )}

                {toDecide.length === 0 && activity.length === 0 && !busy && (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    {filter === "all" ? "Nothing here yet. Ask Atlas something below." : "Nothing in this filter yet."}
                  </p>
                )}
              </section>
            </div>

            {/* Ask Atlas, docked under the feed like a chat composer. */}
            <div className="min-w-0 shrink-0 px-3 pt-2 pb-3 sm:px-5">
              <Composer
                onResearch={research}
                onWhatIf={whatIf}
                onSector={sector}
                onReview={review}
                onScan={scan}
                canReview={Boolean(state.portfolio?.holdings.length)}
                claudeLinkFor={claudeLinkFor}
                claudeSectorLinkFor={claudeSectorLinkFor}
                tickers={(state.portfolio?.holdings ?? []).filter((h) => isResearchableStock(h.ticker, h.kind)).sort((a, b) => b.value - a.value).slice(0, 3).map((h) => h.ticker)}
                busy={isBusy}
                inputRef={composerRef}
              />
            </div>
          </main>
        ) : (
          <main key={view} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-348 space-y-4 px-3 py-5 sm:px-5">
              {banners}
              {view === "overview" && <OverviewView {...viewProps} />}
              {view === "daily" && <DailyView {...viewProps} />}
              {view === "rules" && <RulesView {...viewProps} />}
              {view === "connections" && <ConnectionsView {...viewProps} />}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
