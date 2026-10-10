"use client";

import type { ChatMessage, DailyBrief, Stance } from "@/lib/types";
import { clockTime, Markdown, money, pct, signedPct } from "./format";
import { FeedItem, OriginTag, SampleTag } from "./ui";

const VERDICT: Record<Stance, string> = {
  consider_buying: "Consider buying more",
  consider_selling: "Consider selling some",
  hold_and_watch: "Hold and keep watching",
  not_enough_info: "Not enough information yet",
};

const TRIGGER: Record<DailyBrief["trigger"], string> = {
  schedule: "scheduled run",
  manual: "you ran it",
  claude: "asked from Claude",
};

/** "Thu, Oct 9" from a local YYYY-MM-DD. */
function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function friendlyTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

function sinceWords(since: string | null): string {
  if (!since) return "the last run";
  const d = new Date(since);
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "yesterday’s run";
  return `the run on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const SUB = "text-xs font-medium tracking-wider text-muted-foreground uppercase";

/**
 * The daily brief, in the feed's one pattern. `expanded` (the Daily run page) shows the whole brief;
 * `sample` marks made-up example content.
 */
export default function DailyBriefCard({ m, b, expanded = false, sample = false }: { m: ChatMessage; b: DailyBrief; expanded?: boolean; sample?: boolean }) {
  const p = b.portfolio;
  const sourceNote =
    p.source === "demo" ? "demo portfolio" : p.source === "paper" ? "paper portfolio" : null;

  let change: string;
  if (p.changeDollars === null) {
    change = "first run, nothing to compare with yet";
  } else if (Math.abs(p.changeDollars) < 0.5) {
    change = `unchanged since ${sinceWords(p.since)}`;
  } else {
    const sign = p.changeDollars > 0 ? "+" : "−";
    change = `${sign}${money(Math.abs(p.changeDollars), 0)}${p.changePct !== null ? ` (${signedPct(p.changePct)})` : ""} since ${sinceWords(p.since)}`;
  }

  const body = (
    <>
      {sourceNote && !sample && <p className="text-xs text-muted-foreground">Based on a {sourceNote}.</p>}

      <Markdown text={b.summary || m.text} />

      {b.movers.length > 0 && (
        <section>
          <h4 className={SUB}>Your holdings, biggest move first</h4>
          <ul className="mt-1.5 divide-y divide-white/[0.07]">
            {b.movers.map((x) => (
              <li key={x.ticker} className="flex items-baseline justify-between gap-2 py-1.5">
                <span>
                  <span className="font-semibold">{x.ticker}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{pct(x.weight, 0)} of your portfolio</span>
                </span>
                <span className={x.changePct !== null && x.changePct > 0 ? "tabular-nums" : "text-muted-foreground tabular-nums"}>
                  {x.changePct === null ? "no comparison yet" : signedPct(x.changePct)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.flags.length > 0 && (
        <section>
          <h4 className={SUB}>Things your rules flagged</h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {b.flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {b.researched.length > 0 && (
        <section>
          <h4 className={SUB}>Stocks researched in depth</h4>
          <ul className="mt-1.5 space-y-1">
            {b.researched.map((r) => (
              <li key={r.ticker}>
                <span className="font-semibold">{r.ticker}</span>:{" "}
                {r.failed || !r.stance
                  ? "research didn’t finish. Try it again on its own."
                  : `${VERDICT[r.stance]}${r.confidenceScore !== null ? `, confidence ${r.confidenceScore} out of 100` : ""}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!sample && (
        <p>
          {b.recommendations > 0
            ? `${b.recommendations} suggestion${b.recommendations === 1 ? "" : "s"} follow as their own cards. Nothing is bought or sold unless you click, and these run in paper mode (simulated).`
            : "No suggestions today."}
        </p>
      )}
      {b.nextRunAt && !sample && <p className="text-xs text-muted-foreground">Next daily run: {friendlyTime(b.nextRunAt)}.</p>}
    </>
  );

  return (
    <FeedItem
      kind="Daily brief"
      tag={sample ? <SampleTag /> : <OriginTag origin={m.origin} />}
      time={
        sample ? undefined : (
          <>
            {TRIGGER[b.trigger]} · <time dateTime={m.createdAt}>{clockTime(m.createdAt)}</time>
          </>
        )
      }
      title={
        <>
          {dayLabel(b.day)} · <span className="tabular-nums">{money(p.total)}</span>
        </>
      }
      summary={
        <>
          Portfolio {change}.{" "}
          {b.flags.length > 0 ? `${b.flags.length} thing${b.flags.length === 1 ? "" : "s"} flagged by your rules.` : "Nothing over your limits."}
          {b.researched.length > 0 && ` ${b.researched.length} stock${b.researched.length === 1 ? "" : "s"} researched in depth.`}
        </>
      }
      details={expanded ? undefined : body}
      detailsLabel="the brief"
    >
      {sample && <p className="mt-2 text-xs text-muted-foreground">Made-up example. Your real brief replaces it after the first daily run.</p>}
      {expanded && <div className="mt-4 space-y-4 border-t border-white/[0.08] pt-4">{body}</div>}
    </FeedItem>
  );
}
