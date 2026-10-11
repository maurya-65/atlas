"use client";

import { useState, type ReactNode } from "react";
import type { ChatMessage, ResearchAngle, ResearchResult, SourceRef, Stance } from "@/lib/types";
import AgentRoom from "./AgentRoom";
import Cited from "./Cited";
import DecisionOptions from "./DecisionOptions";
import { compactMoney, Markdown, plainText } from "./format";
import Graph from "./Graph";
import Sources from "./Sources";
import { FeedItem, OriginTag, Progress, cn } from "./ui";

function stanceLabel(stance: Stance, owned: boolean) {
  switch (stance) {
    case "consider_buying":
      return owned ? "Consider buying more" : "Consider buying";
    case "consider_selling":
      return owned ? "Consider selling some" : "Consider avoiding";
    case "hold_and_watch":
      return owned ? "Hold and keep watching" : "Keep watching";
    default:
      return "Not enough information yet";
  }
}

function whenRan(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const HEADING = "text-xs font-semibold tracking-wider text-muted-foreground uppercase";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className={HEADING}>{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** A closed-by-default part of the report (graph, sources, transcript, full Claude report). */
function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group/fold rounded-xl border border-white/[0.08]">
      <summary className={cn("flex items-center justify-between gap-2 px-3 py-2", HEADING)}>
        {title}
        <span aria-hidden className="text-[10px] transition-transform group-open/fold:rotate-90">
          &#9656;
        </span>
      </summary>
      <div className="border-t border-white/[0.08] px-3 py-3">{children}</div>
    </details>
  );
}

function Analyst({ a, sources, owned }: { a: ResearchAngle; sources: SourceRef[]; owned: boolean }) {
  const moved = a.finalStance !== a.stance || a.finalScore !== a.score;
  const oneLine = (a.points[0]?.text ?? a.report).replace(/\s*\[\d+\]/g, "");
  return (
    <details className="group/analyst border-t border-white/[0.08] first:border-t-0">
      <summary className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5">
        <span className="font-medium">{a.name}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {a.failed ? "Didn’t finish" : `${stanceLabel(a.finalStance, owned)} · ${a.finalScore}/100`}
        </span>
        {oneLine && <span className="col-span-2 truncate text-xs text-muted-foreground group-open/analyst:hidden">{oneLine}</span>}
      </summary>
      <div className="max-w-[75ch] space-y-2 px-3 pb-3 text-sm">
        {a.focus && (
          <p className="text-xs text-muted-foreground">
            {a.focus} Read {a.sourcesRead} source{a.sourcesRead === 1 ? "" : "s"}.
          </p>
        )}
        <p className="leading-relaxed">
          <Cited text={a.report} sources={sources} />
        </p>
        {a.points.length > 0 && (
          <ul className="list-disc space-y-1 pl-5">
            {a.points.map((p, i) => (
              <li key={i}>
                <Cited text={p.text} sources={sources} />
                {p.sources.length > 0 && !/\[\d+\]/.test(p.text) && <Cited text={" " + p.sources.map((n) => `[${n}]`).join("")} sources={sources} />}
              </li>
            ))}
          </ul>
        )}
        {!a.failed && (a.challenge || a.changedMind || moved) && (
          <div className="rounded-xl bg-white/[0.05] px-3 py-2">
            <div className={HEADING}>In the debate</div>
            {a.challenge && (
              <p className="mt-1">
                <span className="font-medium">Pushed back: </span>
                <Cited text={a.challenge} sources={sources} />
              </p>
            )}
            {a.changedMind && (
              <p className="mt-1">
                <span className="font-medium">Changed its mind: </span>
                <Cited text={a.changedMind} sources={sources} />
              </p>
            )}
            {moved && (
              <p className="mt-1 text-xs text-muted-foreground">
                Before: {stanceLabel(a.stance, owned)}, {a.score}/100 → after: {stanceLabel(a.finalStance, owned)}, {a.finalScore}/100
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

/** Bulleted points in a tinted panel: the first four, with a toggle for the rest. */
function PointPanel({ title, items, sources, tone }: { title: string; items?: string[]; sources: SourceRef[]; tone: "up" | "down" | "plain" }) {
  const [all, setAll] = useState(false);
  if (!items?.length) return null;
  const shown = all ? items : items.slice(0, 4);
  // Monochrome: "+" and "−" in front of the heading say which side it is.
  const mark = tone === "up" ? "+ " : tone === "down" ? "− " : "";
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
      <h4 className={cn(HEADING, tone === "up" && "text-foreground")}>
        {mark}
        {title}
      </h4>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
        {shown.map((p, i) => (
          <li key={i}>
            <Cited text={p} sources={sources} />
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function Revenue({ revenue }: { revenue: ResearchResult["revenue"] }) {
  if (!revenue?.length) return null;
  const rows = revenue.slice(-8);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const first = rows[0].value;
  const last = rows[rows.length - 1].value;
  const change = first > 0 ? last / first - 1 : null;
  return (
    <Section title="Revenue from SEC filings">
      {change !== null && rows.length > 1 && (
        <p className="mb-2 text-sm text-muted-foreground">
          Revenue {change >= 0 ? "grew" : "shrank"} {(Math.abs(change) * 100).toFixed(0)}% from {rows[0].period} to {rows[rows.length - 1].period}.
        </p>
      )}
      <ul className="max-w-xl space-y-1">
        {rows.map((r) => (
          <li key={r.period} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{r.period}</span>
            <span className="h-2 rounded-full bg-white/[0.08]">
              <span className="block h-2 rounded-full bg-white/60" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums">{compactMoney(r.value)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function ResearchCard({
  r,
  m,
  onChoose,
  disabled = false,
}: {
  r: ResearchResult;
  m?: ChatMessage;
  onChoose?: (messageId: string, optionIndex: number) => Promise<void>;
  disabled?: boolean;
}) {
  const owned = Boolean(r.position);
  const angles = r.angles ?? [];
  const finished = angles.filter((a) => !a.failed);
  const agreeing = finished.filter((a) => a.finalStance === r.stance).length;
  const deep = angles.length > 0;
  const fromClaude = r.via === "claude";
  const ran = whenRan(r.generatedAt);
  const hasAgreement = (r.agreements?.length ?? 0) > 0 || (r.disagreements?.length ?? 0) > 0;
  const intro = m?.text ? plainText(m.text) : "";

  return (
    <FeedItem
      kind={fromClaude ? "Research in Claude" : "Research"}
      label={`Research on ${r.ticker}`}
      tag={<OriginTag origin={m?.origin} />}
      time={ran && <time dateTime={r.generatedAt}>{ran}</time>}
      title={
        <>
          {r.ticker} {r.companyName !== r.ticker && <span className="font-normal text-muted-foreground">{r.companyName}</span>}
        </>
      }
      summary={<Cited text={r.thesis} sources={r.sources} />}
      detailsLabel="full research"
      details={
        <>
          {intro && <p className="max-w-[75ch] text-muted-foreground">{intro}</p>}

          <Section title="The short version">
            <p className="max-w-[75ch] leading-relaxed">
              <Cited text={r.thesis} sources={r.sources} />
            </p>
          </Section>

          {(r.position || (deep && !fromClaude && finished.length > 0)) && (
            <p className="text-xs text-muted-foreground">
              {r.position && (
                <>
                  You own {compactMoney(r.position.value)}
                  {r.position.weight > 0 && <> ({(r.position.weight * 100).toFixed(1)}% of your portfolio)</>}
                  {r.position.pnlPct != null && (
                    <>
                      , {r.position.pnlPct >= 0 ? "up" : "down"} {(Math.abs(r.position.pnlPct) * 100).toFixed(1)}% from what you paid
                    </>
                  )}
                  .{" "}
                </>
              )}
              {deep && !fromClaude && finished.length > 0 && (
                <>
                  {agreeing} of {finished.length} analysts agree after the debate.
                </>
              )}
            </p>
          )}

          <p className="max-w-[75ch] text-muted-foreground">
            <span className="font-medium text-foreground">Why this confidence:</span> <Cited text={r.confidenceReason} sources={r.sources} />
          </p>

          {(r.bullPoints.length > 0 || r.bearPoints.length > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PointPanel title="Points in favour" items={r.bullPoints} sources={r.sources} tone="up" />
              <PointPanel title="Points against" items={r.bearPoints} sources={r.sources} tone="down" />
            </div>
          )}

          {r.whatWouldChangeMyMind && (
            <div className="rounded-xl border-l-2 border-white/40 bg-white/[0.04] px-3 py-2.5">
              <div className={HEADING}>What would change my mind</div>
              <p className="mt-1 max-w-[75ch] leading-relaxed">
                <Cited text={r.whatWouldChangeMyMind} sources={r.sources} />
              </p>
            </div>
          )}

          {deep && (
            <Section title={fromClaude ? "Claude’s analysts" : "The analysts"}>
              <div className="rounded-xl border border-white/[0.08]">
                {angles.map((a) => (
                  <Analyst key={a.name} a={a} sources={r.sources} owned={owned} />
                ))}
              </div>
            </Section>
          )}

          {hasAgreement && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PointPanel title="Where they agreed" items={r.agreements} sources={r.sources} tone="plain" />
              <PointPanel title="Where they disagreed" items={r.disagreements} sources={r.sources} tone="plain" />
            </div>
          )}

          <Revenue revenue={r.revenue} />

          <div className="space-y-2">
            {r.nodes.length > 1 && (
              <Fold title="Connections graph">
                <Graph nodes={r.nodes} edges={r.edges} />
              </Fold>
            )}
            {r.transcript && r.transcript.length > 0 && (
              <Fold title={`Replay the agents’ conversation (${r.transcript.filter((e) => e.agent !== "Atlas").length} messages)`}>
                <AgentRoom events={r.transcript} sources={r.sources} />
              </Fold>
            )}
            {r.fullReport && (
              <Fold title="Claude’s full report">
                <div className="max-h-[28rem] overflow-y-auto pr-2">
                  <Markdown text={r.fullReport} className="max-w-[75ch]" />
                </div>
              </Fold>
            )}
          </div>

          <Sources sources={r.sources} numbered={deep} max={deep ? 60 : 8} />

          <p className="text-xs text-muted-foreground">
            This is a summary of public information, not financial advice. Atlas won’t act on it unless you approve a trade.
          </p>
        </>
      }
    >
      {/* The verdict in one short line: what, and how sure. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium">{stanceLabel(r.stance, owned)}</span>
        <span className="text-muted-foreground">
          Confidence {r.confidence}
          {r.confidenceScore != null && <span className="tabular-nums"> · {r.confidenceScore}/100</span>}
        </span>
        {r.confidenceScore != null && (
          <div className="w-24">
            <Progress value={r.confidenceScore} label={`Confidence (${r.confidence})`} />
          </div>
        )}
      </div>
      {m && onChoose && <DecisionOptions messageId={m.id} options={m.options} resolved={m.resolved} onChoose={onChoose} disabled={disabled} />}
    </FeedItem>
  );
}
