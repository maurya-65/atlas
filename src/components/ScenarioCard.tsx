"use client";

import type { ChatMessage, ScenarioHoldingImpact, ScenarioResult } from "@/lib/types";
import DecisionOptions from "./DecisionOptions";
import Graph from "./Graph";
import { clockTime, money } from "./format";
import Sources from "./Sources";
import Cited from "./Cited";
import { FeedItem, OriginTag } from "./ui";

const EXPOSURE: Record<ScenarioHoldingImpact["exposure"], string> = {
  high: "Highly exposed",
  medium: "Somewhat exposed",
  low: "Slightly exposed",
  none: "Not exposed",
};

const DIRECTION: Record<ScenarioHoldingImpact["direction"], string> = {
  hurt: "Likely hurt",
  helped: "Likely helped",
  mixed: "Mixed effects",
  unclear: "Unclear",
};

/** "−$1,240" / "+$310" with a real minus sign, whole dollars. */
function signedMoney(n: number) {
  if (Math.abs(n) < 0.5) return "$0";
  return `${n < 0 ? "−" : "+"}${money(Math.abs(n), 0)}`;
}

function signedPct(fraction: number) {
  if (Math.abs(fraction) < 0.0005) return "0%";
  return `${fraction < 0 ? "−" : "+"}${(Math.abs(fraction) * 100).toFixed(1)}%`;
}

function range(low: number, high: number, fmt: (n: number) => string) {
  const [a, b] = low <= high ? [low, high] : [high, low];
  return fmt(a) === fmt(b) ? fmt(a) : `${fmt(a)} to ${fmt(b)}`;
}

/** Plain words for the overall effect, so meaning never depends on colour. */
function impactSentence(s: ScenarioResult) {
  const { dollarsLow, dollarsHigh, pctLow, pctHigh } = s.portfolioImpact;
  const lo = Math.min(dollarsLow, dollarsHigh);
  const hi = Math.max(dollarsLow, dollarsHigh);
  let direction: string;
  if (hi < 0) direction = "lose value";
  else if (lo > 0) direction = "gain value";
  else if (lo === 0 && hi === 0) direction = "barely change";
  else direction = "go either way";
  return {
    direction,
    dollars: range(lo, hi, signedMoney),
    pct: range(Math.min(pctLow, pctHigh), Math.max(pctLow, pctHigh), signedPct),
  };
}

function trace(s: ScenarioResult) {
  const planners = s.agents.filter((a) => a.role === "planner");
  const researchers = s.agents.filter((a) => a.role === "researcher");
  const synth = s.agents.find((a) => a.role === "synthesizer");
  const read = researchers.reduce((sum, a) => sum + a.sourcesRead, 0);
  const parts: string[] = [];
  if (planners.length) parts.push(`Planner split it into ${s.channels.length} ways it could spread`);
  if (researchers.length)
    parts.push(
      `${researchers.length} researcher agent${researchers.length === 1 ? "" : "s"} read ${read} public source${read === 1 ? "" : "s"}`,
    );
  if (synth) parts.push(`Synthesizer mapped it onto your ${s.holdings.length} stock${s.holdings.length === 1 ? "" : "s"}`);
  return parts;
}

const SUB = "text-xs font-medium tracking-wider text-muted-foreground uppercase";
const PILL = "rounded-full border border-white/10 px-2 py-0.5";

export default function ScenarioCard({
  m,
  s,
  onChoose,
  disabled,
}: {
  m: ChatMessage;
  s: ScenarioResult;
  onChoose: (messageId: string, optionIndex: number) => Promise<void>;
  disabled: boolean;
}) {
  // Text with [n] citations: links on cards whose numbers match their source list, plain text on older cards.
  const cited = (text: string) => (s.numbered ? <Cited text={text} sources={s.sources} /> : text.replace(/\s?\[\d+\]/g, ""));
  const impact = impactSentence(s);
  const exposed = [...s.holdings].sort((a, b) => Math.min(a.dollarsLow, a.dollarsHigh) - Math.min(b.dollarsLow, b.dollarsHigh));
  const steps = trace(s);

  return (
    <FeedItem
      kind="What-if"
      label="What-if analysis"
      tag={<OriginTag origin={m.origin} />}
      time={<time dateTime={m.createdAt}>{clockTime(m.createdAt)}</time>}
      title={<>“{s.scenario}”</>}
      summary={s.headline ? cited(s.headline) : undefined}
      details={
        <>
          <p className="text-xs text-muted-foreground">
            Rough estimate on {money(s.portfolioImpact.totalValue, 0)} of holdings. Negative numbers mean a loss, positive mean a gain.
          </p>

          <div>
            <span className="font-semibold">Recommendation: </span>
            {cited(s.recommendation)}
            <div className="mt-1 text-muted-foreground">
              <span className="font-medium text-foreground capitalize">Confidence: {s.confidence}.</span> {cited(s.confidenceReason)}
            </div>
          </div>

          {steps.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">How Atlas worked this out:</span> {steps.join(" · ")}
            </p>
          )}

          {exposed.length > 0 && (
            <div>
              <h4 className={SUB}>Your stocks</h4>
              <ul className="mt-2 divide-y divide-white/[0.08] rounded-xl border border-white/[0.08]">
                {exposed.map((h) => (
                  <li key={h.ticker} className="px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <div>
                        <span className="font-semibold">{h.ticker}</span>
                        {h.name && <span className="ml-1.5 text-xs text-muted-foreground">{h.name}</span>}
                        <span className="ml-1.5 text-xs text-muted-foreground">· {(h.weight * 100).toFixed(0)}% of portfolio</span>
                      </div>
                      <div className="font-medium tabular-nums">{range(h.dollarsLow, h.dollarsHigh, signedMoney)}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <span className={PILL}>{EXPOSURE[h.exposure] ?? h.exposure}</span>
                      <span className={PILL}>{DIRECTION[h.direction] ?? h.direction}</span>
                      <span className={`${PILL} tabular-nums`}>price {range(h.moveLowPct, h.moveHighPct, signedPct)}</span>
                    </div>
                    {h.path.length > 0 && <p className="mt-1.5 text-xs font-medium">{h.path.map((step) => step.replace(/\s?\[\d+\]/g, "")).join(" → ")}</p>}
                    {h.why && <p className="mt-0.5 text-xs text-muted-foreground">{cited(h.why)}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.nodes.length > 0 && <Graph nodes={s.nodes} edges={s.edges} />}

          {s.channels.length > 0 && (
            <div>
              <h4 className={SUB}>Ways it could spread</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {s.channels.map((c, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.08] px-3 py-2 text-sm">
                    <div className="font-medium">{c.name}</div>
                    <p className="text-xs text-muted-foreground">{cited(c.mechanism)}</p>
                    {c.findings.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                        {c.findings.map((f, j) => (
                          <li key={j}>{cited(f)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Sources sources={s.sources.length ? s.sources : m.sources} numbered={s.numbered} max={s.numbered ? 60 : 8} />

          <p className="text-xs text-muted-foreground">
            A rough what-if built from public information, not a prediction or financial advice. Atlas won’t trade unless you approve.
          </p>
        </>
      }
    >
      {/* The estimate in one short line. */}
      <p className="mt-3">
        <span className="text-muted-foreground">Your portfolio could {impact.direction}: </span>
        <span className="font-semibold tabular-nums">{impact.dollars}</span> <span className="text-muted-foreground tabular-nums">({impact.pct})</span>
      </p>
      {s.recommendation && (
        <p className="mt-1 line-clamp-1">
          <span className="text-muted-foreground">Recommended: </span>
          {cited(s.recommendation)}
        </p>
      )}
      <DecisionOptions messageId={m.id} options={m.options ?? s.options} resolved={m.resolved} onChoose={onChoose} disabled={disabled} />
    </FeedItem>
  );
}
