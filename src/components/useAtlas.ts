"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildClaudePrompt, buildSectorPrompt, claudeUrl } from "@/lib/handoff";
import type { IdeaEvent, Mode, ResearchEvent } from "@/lib/types";
import { api, streamApi, type AppState } from "./format";
import { useJobs, type Job } from "./jobs";
import { companyHref, goTo } from "./views";

interface ChoiceNext {
  research?: string;
  whatIf?: string;
}

/** Where a piece of work was started: inside a chat (its result stays in that chat too), or anywhere else. */
interface Origin {
  threadId?: string;
}

export interface NewRule {
  kind: string;
  threshold: number;
  ticker?: string;
}

/**
 * Everything the pages need: the saved state, what is running, and every action. Long jobs run in the
 * background and are tracked in `jobs`, so the user can keep working while Atlas does them.
 */
export function useAtlas() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The chat question Atlas is answering, so that chat can show it thinking */
  const [asking, setAsking] = useState<string | null>(null);
  /** The decision card being acted on */
  const [choosing, setChoosing] = useState<string | null>(null);
  /** What an Ideas search is doing right now, for its stage rail. `id` is the page it belongs to, once there is one. */
  const [ideasRun, setIdeasRun] = useState<{ id: string | null; events: IdeaEvent[] } | null>(null);
  const jobs = useJobs();

  const refresh = useCallback(async () => {
    try {
      setState(await api<AppState>("/api/state"));
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
      jobs.notify("Brokerage connected through SnapTrade. Atlas can now see your real holdings.", "#portfolio");
      url.searchParams.delete("connected");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once
  }, [refresh]);

  // The Atlas Chrome extension runs Claude Deep Research in another tab and reports back with these events.
  const claudeJob = useRef<ReturnType<typeof jobs.begin>>(null);
  useEffect(() => {
    const started = (e: Event) => {
      const ticker = (e as CustomEvent<{ ticker?: string }>).detail?.ticker || "this stock";
      if (claudeJob.current) jobs.finish(claudeJob.current, { error: "Started again." });
      claudeJob.current = jobs.begin({
        kind: "claude",
        label: `Claude Deep Research on ${ticker}`,
        landing: { text: `Research → ${ticker}`, href: companyHref(ticker) },
      });
      claudeJob.current?.setDetail("Press send in the Claude tab");
    };
    const progress = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (text) claudeJob.current?.setDetail(text);
    };
    const imported = () => {
      if (claudeJob.current) jobs.finish(claudeJob.current, {});
      claudeJob.current = null;
      refresh();
    };
    const failed = (e: Event) => {
      const message = (e as CustomEvent<{ error?: string }>).detail?.error ?? "Claude Deep Research didn’t finish.";
      if (claudeJob.current) jobs.finish(claudeJob.current, { error: message });
      else setError(message);
      claudeJob.current = null;
    };
    window.addEventListener("atlas:claude-started", started);
    window.addEventListener("atlas:claude-status", progress);
    window.addEventListener("atlas:imported", imported);
    window.addEventListener("atlas:claude-error", failed);
    return () => {
      window.removeEventListener("atlas:claude-started", started);
      window.removeEventListener("atlas:claude-status", progress);
      window.removeEventListener("atlas:imported", imported);
      window.removeEventListener("atlas:claude-error", failed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the job helpers are stable
  }, [refresh]);

  // Results are saved as they arrive, so look often while something runs and quietly now and then otherwise
  // (the scheduled morning check posts cards without a click). Never while the tab is hidden.
  const working = jobs.running.length > 0 || Boolean(asking) || Boolean(state?.daily?.running);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, working ? 6000 : 30000);
    return () => clearInterval(id);
  }, [working, refresh]);

  /** Streams a research to the server, passing the agents' conversation to the job. */
  const streamResearch = (path: string, body: unknown, addEvent: (e: ResearchEvent) => void) => streamApi<ResearchEvent>(path, body, addEvent);

  const research = useCallback(
    (ticker: string, origin: Origin = {}) => {
      const t = ticker.toUpperCase();
      return jobs
        .run({ kind: "research", key: `research:${t}`, label: `Research on ${t}`, landing: { text: `Research → ${t}`, href: companyHref(t) } }, async (job) => {
          job.setDetail("Nine analysts are reading filings, news and the web");
          await streamResearch("/api/research", { ticker: t, threadId: origin.threadId }, job.addEvent);
        })
        .then(async (ok) => {
          await refresh();
          return ok;
        });
    },
    [jobs, refresh],
  );

  const whatIf = useCallback(
    (scenario: string, origin: Origin = {}, label = "What-if") =>
      jobs
        .run({ kind: "whatif", label, landing: { text: "Research → What-ifs", href: "#research/scenarios" } }, async (job) => {
          job.setDetail("Planning the ways it could spread");
          const later = [setTimeout(() => job.setDetail("Reading news and government notices"), 8000), setTimeout(() => job.setDetail("Mapping it onto your stocks"), 25000)];
          try {
            await api("/api/scenario", { scenario, threadId: origin.threadId });
          } finally {
            later.forEach(clearTimeout);
          }
        })
        .then(async (ok) => {
          await refresh();
          return ok;
        }),
    [jobs, refresh],
  );

  /** A sector research runs on the what-if agents: they read what is happening in it and map it onto the user's stocks. */
  const sector = useCallback(
    (name: string, origin: Origin = {}) =>
      whatIf(`Recent developments in the ${name} sector: what is happening in it right now, and what does it mean for my stocks?`, origin, `Research on the ${name} sector`),
    [whatIf],
  );

  // One request per stock, so a long review never depends on one connection staying open for minutes.
  const review = useCallback(
    () =>
      jobs
        .run({ kind: "review", key: "review", label: "Research on your top 3 stocks", landing: { text: "Research", href: "#research" } }, async (job) => {
          job.setDetail("Choosing your biggest holdings");
          const { picks } = await api<{ picks: string[] }>("/api/review", { step: "start" });
          for (const [i, ticker] of picks.entries()) {
            job.setDetail(`${ticker} (${i + 1} of ${picks.length})`);
            try {
              await streamResearch("/api/research", { ticker, review: { index: i, count: picks.length } }, job.addEvent);
            } catch {
              // One stock failing doesn't stop the review; the summary says which one didn't finish.
            }
            await refresh();
          }
          if (picks.length) await api("/api/review", { step: "finish", tickers: picks });
        })
        .then(async (ok) => {
          await refresh();
          return ok;
        }),
    [jobs, refresh],
  );

  /** Both steps of an Ideas search: the first asks the questions, the second finds the ideas. */
  const findIdeas = useCallback(
    (body: { action: "start"; prompt: string } | { action: "answer"; id: string; answers: string[] }) => {
      const id = body.action === "answer" ? body.id : null;
      return jobs
        .run({ kind: "ideas", key: "ideas", label: "Looking for ideas", landing: { text: "Ideas", href: id ? `#ideas/${id}` : "#ideas" } }, async (job) => {
          setIdeasRun({ id, events: [] });
          job.setDetail("Reading what you asked");
          await streamApi<IdeaEvent>("/api/ideas", body, (e) => {
            setIdeasRun((run) => run && { ...run, events: [...run.events, e] });
            job.setDetail(e.text);
          });
        })
        .then(async (ok) => {
          await refresh();
          setIdeasRun(null);
          return ok;
        });
    },
    [jobs, refresh],
  );

  const scan = useCallback(
    () =>
      jobs
        .run({ kind: "scan", key: "scan", label: "Check on your portfolio", landing: { text: "Home and History", href: "#home" } }, async (job) => {
          job.setDetail("Reading filings, news and government notices");
          await api("/api/scan", {});
        })
        .then(async (ok) => {
          await refresh();
          return ok;
        }),
    [jobs, refresh],
  );

  const runMorningCheck = useCallback(
    () =>
      jobs
        .run({ kind: "morning", key: "morning", label: "Morning check", landing: { text: "Home", href: "#home" } }, async (job) => {
          job.setDetail("Checking your portfolio and researching");
          await streamResearch("/api/daily/run", {}, job.addEvent);
        })
        .then(async (ok) => {
          await refresh();
          return ok;
        }),
    [jobs, refresh],
  );

  /** Saves what the user said in a chat, then lets Atlas answer it. */
  const ask = useCallback(
    async (question: string, threadId: string) => {
      setError(null);
      setAsking(threadId);
      try {
        await api("/api/threads", { action: "say", threadId, text: question });
        await refresh();
        await api("/api/chat", { threadId });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        await refresh();
        setAsking(null);
      }
    },
    [refresh],
  );

  /** The user picked an option on a decision card. Research and what-ifs chosen there run as jobs. */
  const choose = useCallback(
    async (messageId: string, optionIndex: number, origin: Origin = {}) => {
      setError(null);
      setChoosing(messageId);
      let next: ChoiceNext | undefined;
      try {
        ({ next } = await api<{ next?: ChoiceNext }>("/api/action", { messageId, optionIndex }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        await refresh();
        setChoosing(null);
      }
      if (next?.research) research(next.research, origin);
      else if (next?.whatIf) whatIf(next.whatIf, origin);
    },
    [refresh, research, whatIf],
  );

  const mutate = useCallback(
    async (path: string, body: unknown) => {
      setError(null);
      try {
        await api(path, body);
      } catch (e) {
        setError((e as Error).message);
      }
      await refresh();
    },
    [refresh],
  );

  const actions = {
    ask,
    research,
    whatIf,
    sector,
    review,
    scan,
    runMorningCheck,
    askIdeas: (prompt: string) => findIdeas({ action: "start", prompt }),
    answerIdeas: (id: string, answers: string[]) => findIdeas({ action: "answer", id, answers }),
    choose,
    setMorningCheck: (patch: { enabled?: boolean; time?: string; depth?: number }) =>
      mutate("/api/daily", { ...patch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    importReport: async (text: string) => {
      await api("/api/import", { text });
      await refresh();
    },
    setTopics: (interests: string[]) => mutate("/api/interests", { interests }),
    deleteRule: (id: string) => mutate("/api/rules", { action: "delete", id }),
    /** Throws a plain-words error when the rule isn't valid */
    addRule: async (rule: NewRule) => {
      await api("/api/rules", { action: "add", ...rule });
      await refresh();
    },
    watch: (ticker: string) => mutate("/api/watchlist", { action: "add", ticker }),
    unwatch: (ticker: string) => mutate("/api/watchlist", { action: "remove", ticker }),
    clearMemory: () => mutate("/api/memory", { action: "clear" }),
    selectAccount: (accountId: string) => mutate("/api/account", { accountId }),
    /** Paper or live; going live needs the typed confirmation. Throws a plain-words error. */
    switchMode: async (mode: Mode, confirm?: string) => {
      const res = await api<{ ok: boolean; error?: string }>("/api/mode", { mode, confirm });
      if (res && res.ok === false) throw new Error(res.error ?? "Couldn’t switch mode.");
      await refresh();
    },
    deleteChat: async (threadId: string) => {
      await api("/api/threads", { action: "delete", threadId });
      await refresh();
    },
    /** Clears everything Atlas saved, keeps the brokerage link. */
    reset: async () => {
      await mutate("/api/reset", {});
      goTo("home");
    },
    signOut: async () => {
      await api("/api/logout", {}).catch(() => undefined);
      window.location.replace("/login");
    },
    /** The prompt link that opens Claude Deep Research on a ticker, with the user's position filled in. */
    claudeLinkFor: (ticker: string) => {
      const holding = state?.portfolio?.holdings.find((h) => h.ticker === ticker);
      return claudeUrl(buildClaudePrompt({ ticker, name: holding?.name, holding, portfolioTotal: state?.portfolio?.total }));
    },
    claudeSectorLinkFor: (name: string) => claudeUrl(buildSectorPrompt(name, state?.portfolio?.holdings.map((h) => h.ticker) ?? [])),
  };

  return { state, loadError, error, clearError: () => setError(null), refresh, asking, choosing, ideasRun, jobs, actions };
}

export type Atlas = ReturnType<typeof useAtlas> & { state: AppState };
export type Actions = Atlas["actions"];
export type { Job };
