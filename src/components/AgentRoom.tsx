"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchEvent, SourceRef, Stance } from "@/lib/types";
import Cited from "./Cited";

const STANCE_SHORT: Record<Stance, string> = {
  consider_buying: "Buy",
  consider_selling: "Sell",
  hold_and_watch: "Hold",
  not_enough_info: "Unsure",
};

const PHASE_LABEL: Record<ResearchEvent["phase"], string> = {
  status: "",
  reading: "Reading",
  report: "Report",
  debate: "Pushes back",
  changed_mind: "After the debate",
  verdict: "Verdict",
};

// One grey per analyst seat; meaning never depends on colour (names are always shown).
const SEAT_COLORS = [
  "bg-neutral-100 text-black",
  "bg-neutral-200 text-black",
  "bg-neutral-300 text-black",
  "bg-neutral-400 text-black",
  "bg-neutral-500 text-white",
  "bg-neutral-600 text-white",
  "bg-neutral-700 text-white",
  "bg-neutral-800 text-white",
  "bg-neutral-900 text-white",
];

function initials(name: string) {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Seat {
  name: string;
  color: string;
  status: string;
  score?: number;
}

/** Live (or replayed) view of the research agents: who is reading, what they wrote, who pushed back. */
export default function AgentRoom({
  events,
  live = false,
  sources: givenSources,
}: {
  events: ResearchEvent[];
  live?: boolean;
  /** Numbered sources for [n] links; when live, they arrive in the events */
  sources?: SourceRef[];
}) {
  const tickers = useMemo(() => [...new Set(events.map((e) => e.ticker))], [events]);
  const [pickedTicker, setPickedTicker] = useState<string | null>(null);
  const ticker = pickedTicker && tickers.includes(pickedTicker) ? pickedTicker : tickers[tickers.length - 1];
  const [focus, setFocus] = useState<string | null>(null);
  const [debateOnly, setDebateOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const mine = events.filter((e) => e.ticker === ticker);
  const sources: (SourceRef | undefined)[] = useMemo(() => {
    if (givenSources) return givenSources;
    // Atlas sends the starting list; analysts add the pages they find on the web as they go.
    const out: (SourceRef | undefined)[] = [];
    for (const e of mine) for (const s of e.sources ?? []) out[s.n - 1] = { title: s.title, url: s.url, publisher: s.publisher };
    return out;
  }, [givenSources, mine]);

  const analystNames = [...new Set(mine.filter((e) => e.agent !== "Atlas" && e.agent !== "Judge").map((e) => e.agent))];
  const seats: Seat[] = [...analystNames, "Judge"].map((name, i) => {
    const last = [...mine].reverse().find((e) => e.agent === name);
    const scored = [...mine].reverse().find((e) => e.agent === name && e.score != null);
    let status = live ? "Waiting" : "Done";
    if (last?.phase === "reading") status = live ? "Reading…" : "Read sources";
    else if (last?.phase === "report") status = "Report in";
    else if (last?.phase === "debate" || last?.phase === "changed_mind") status = "Debated";
    else if (last?.phase === "verdict") status = "Verdict";
    else if (last?.phase === "status" && name === "Judge") status = live ? "Thinking…" : "Done";
    else if (last?.phase === "status") status = last.text.startsWith("I couldn't") ? "Didn’t finish" : status;
    return { name, color: name === "Judge" ? "bg-white text-black" : SEAT_COLORS[i % SEAT_COLORS.length], status, score: scored?.score };
  });
  const colorOf = new Map(seats.map((s) => [s.name, s.color]));

  const feed = mine.filter((e) => {
    if (focus && e.agent !== focus) return false;
    if (debateOnly && e.phase !== "debate" && e.phase !== "changed_mind") return false;
    return true;
  });

  const startedAt = mine[0] ? new Date(mine[0].at).getTime() : now;
  const lastPhase = mine[mine.length - 1];
  const pending = !live
    ? null
    : !mine.some((e) => e.phase === "report")
      ? "Analysts are reading and writing their reports…"
      : !mine.some((e) => e.agent === "Judge")
        ? "Analysts are reading each other’s reports and arguing…"
        : !mine.some((e) => e.phase === "verdict")
          ? "The judge is weighing the debate…"
          : null;

  return (
    <section className="glass rounded-2xl p-4" aria-label="Research agents" aria-live={live ? "polite" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {live && <span className="atlas-dot h-2 w-2 rounded-full bg-white" aria-hidden />}
          <h3 className="text-sm font-semibold">
            {live ? "Live: " : ""}research agents{ticker ? ` · ${ticker}` : ""}
          </h3>
        </div>
        {live && <span className="font-mono text-xs tabular-nums text-muted-foreground">{elapsed(now - startedAt)}</span>}
      </div>

      {tickers.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Stocks">
          {tickers.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={t === ticker}
              onClick={() => setPickedTicker(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${t === ticker ? "bg-white text-black" : "border border-white/10 hover:bg-white/[0.07]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {seats.map((s) => {
          const active = focus === s.name;
          return (
            <button
              key={s.name}
              onClick={() => setFocus(active ? null : s.name)}
              aria-pressed={active}
              title={active ? "Show everyone" : `Show only ${s.name}`}
              className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition ${
                active ? "border-white/40 bg-white/[0.1]" : "border-white/[0.08] hover:bg-white/[0.06]"
              }`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${s.color}`} aria-hidden>
                {initials(s.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{s.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {s.status}
                  {s.score != null && ` · ${s.score}/100`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={debateOnly} onChange={(e) => setDebateOnly(e.target.checked)} className="accent-white" />
          Only the debate
        </label>
        {focus && (
          <button onClick={() => setFocus(null)} className="underline decoration-white/25 underline-offset-4 hover:decoration-white">
            Showing {focus} only · show everyone
          </button>
        )}
      </div>

      <ol className="mt-3 space-y-3">
        {feed.map((e, i) => (
          <li key={`${e.at}-${i}`} className={`flex gap-2.5 ${e.agent === "Atlas" ? "opacity-80" : ""}`}>
            <span
              className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                e.agent === "Atlas" ? "bg-neutral-700 text-white" : colorOf.get(e.agent) ?? "bg-neutral-700 text-white"
              }`}
              aria-hidden
            >
              {e.agent === "Atlas" ? "A" : initials(e.agent)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-semibold">{e.agent}</span>
                {PHASE_LABEL[e.phase] && <span className="text-muted-foreground">{PHASE_LABEL[e.phase]}</span>}
                {e.stance && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium">
                    {STANCE_SHORT[e.stance]}
                    {e.score != null && ` · ${e.score}/100`}
                  </span>
                )}
              </div>
              <div
                className={`mt-1 text-sm leading-relaxed ${
                  e.phase === "debate" ? "rounded-lg border-l-2 border-white/40 bg-white/[0.04] px-3 py-2" : ""
                } ${e.phase === "verdict" ? "rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2" : ""}`}
              >
                <Cited text={e.text} sources={sources} />
              </div>
              {e.phase === "reading" && e.sources && e.sources.length > 0 && (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">What it’s reading ({e.sources.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {e.sources.map((s) => (
                      <li key={s.n}>
                        <span className="mr-1 font-mono text-muted-foreground">[{s.n}]</span>
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-4 hover:decoration-white">
                          {s.title}
                        </a>
                        {s.publisher && <span className="text-muted-foreground"> · {s.publisher}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </li>
        ))}
        {feed.length === 0 && <li className="text-sm text-muted-foreground">Nothing here yet.</li>}
      </ol>

      {pending && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span className="flex gap-1" aria-hidden>
            <span className="atlas-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="atlas-dot h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:0.2s]" />
            <span className="atlas-dot h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:0.4s]" />
          </span>
          {pending}
        </p>
      )}
      {live && lastPhase?.phase === "verdict" && <p className="mt-3 text-sm text-muted-foreground">Writing up the card…</p>}
    </section>
  );
}
