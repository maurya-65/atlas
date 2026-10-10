"use client";

import type { ChatMessage } from "@/lib/types";
import { clockTime, Markdown, plainText } from "./format";
import DailyBriefCard from "./DailyBriefCard";
import DecisionOptions from "./DecisionOptions";
import ResearchCard from "./ResearchCard";
import ScenarioCard from "./ScenarioCard";
import Sources from "./Sources";
import { FeedItem, FeedRow, OriginTag } from "./ui";

type Choose = (messageId: string, optionIndex: number) => Promise<void>;

function Time({ iso }: { iso: string }) {
  return <time dateTime={iso}>{clockTime(iso)}</time>;
}

/** A title for cards that have none: the first sentence of the text. */
function leadSentence(text: string): string {
  const t = plainText(text);
  return /^(.{20,}?[.!?])\s/.exec(t)?.[1] ?? t;
}

function firstSentence(text: string, max = 90): string {
  const cut = leadSentence(text);
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-3xl rounded-br-lg border border-white/10 bg-white/[0.1] px-4 py-2.5 backdrop-blur-md">
        <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
      </div>
    </div>
  );
}

/** Plain agent text, a note or a thought: same pattern, nothing to decide. */
function Note({ m, kind }: { m: ChatMessage; kind: string }) {
  const title = m.title || firstSentence(m.text);
  const body = plainText(m.text);
  // When the title was taken from the text, the summary carries on from it instead of repeating it.
  const lead = m.title ? "" : leadSentence(m.text);
  const rest = lead && lead.length <= 90 ? body.slice(lead.length).trim() : body;
  const long = body.length > 180 || Boolean(m.sources?.length);
  return (
    <FeedItem
      kind={kind}
      tag={<OriginTag origin={m.origin} />}
      time={<Time iso={m.createdAt} />}
      title={title}
      summary={rest && rest !== title ? rest : undefined}
      details={
        long ? (
          <>
            <Markdown text={m.text} />
            <Sources sources={m.sources} max={5} />
          </>
        ) : undefined
      }
    />
  );
}

/** A constraint: something that needs a decision. Title, one-line reason, the recommendation, the options. */
function Constraint({ m, onChoose, disabled }: { m: ChatMessage; onChoose: Choose; disabled: boolean }) {
  const title = m.title || firstSentence(m.text);
  const full = (
    <>
      <Markdown text={m.text} />
      {m.recommendation && (
        <p>
          <span className="font-semibold">Recommendation: </span>
          {m.recommendation}
        </p>
      )}
      <Sources sources={m.sources} max={5} />
    </>
  );

  if (m.resolved) {
    // Already decided: one slim row; the whole card is still there when opened.
    return (
      <FeedRow kind="Decided" time={<Time iso={m.createdAt} />} text={<>{title} · <span className="text-muted-foreground">You chose: {m.resolved}</span></>}>
        {full}
      </FeedRow>
    );
  }

  return (
    <FeedItem
      emphasis
      kind="Needs your decision"
      label="Needs your decision"
      tag={<OriginTag origin={m.origin} />}
      time={<Time iso={m.createdAt} />}
      title={title}
      summary={<span className="line-clamp-1">{plainText(m.text)}</span>}
      details={full}
    >
      {m.recommendation && (
        <p className="mt-2 line-clamp-1">
          <span className="text-muted-foreground">Recommended: </span>
          {m.recommendation}
        </p>
      )}
      <DecisionOptions messageId={m.id} options={m.options} resolved={m.resolved} onChoose={onChoose} disabled={disabled} />
    </FeedItem>
  );
}

function Receipt({ m }: { m: ChatMessage }) {
  const live = m.mode === "live";
  return (
    <FeedRow
      kind={live ? "Real trade · real money" : "Simulated trade"}
      tone={live ? "live" : undefined}
      time={<Time iso={m.createdAt} />}
      text={m.title || firstSentence(m.text)}
    >
      <p className="text-xs text-muted-foreground">
        {live ? "Real trade placed in live mode: real money moved." : "Simulated trade in paper mode: no real money moved."}
      </p>
      <Markdown text={m.text} />
    </FeedRow>
  );
}

export function MessageView({ m, onChoose, busy }: { m: ChatMessage; onChoose: Choose; busy: boolean }) {
  switch (m.kind) {
    case "user":
      return <UserBubble m={m} />;
    case "thought":
      return <Note m={m} kind="Thought · no action needed" />;
    case "constraint":
      return <Constraint m={m} onChoose={onChoose} disabled={busy} />;
    case "research":
      return m.research ? <ResearchCard r={m.research} m={m} onChoose={onChoose} disabled={busy} /> : <Note m={m} kind="Research" />;
    case "receipt":
      return <Receipt m={m} />;
    case "scenario":
      return m.scenario ? <ScenarioCard m={m} s={m.scenario} onChoose={onChoose} disabled={busy} /> : <Note m={m} kind="What-if" />;
    case "daily":
      return m.daily ? <DailyBriefCard m={m} b={m.daily} /> : <Note m={m} kind="Daily brief" />;
    default:
      return <Note m={m} kind="Atlas" />;
  }
}

export function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        <span className="atlas-dot size-1.5 rounded-full bg-muted-foreground" />
        <span className="atlas-dot size-1.5 rounded-full bg-muted-foreground [animation-delay:0.2s]" />
        <span className="atlas-dot size-1.5 rounded-full bg-muted-foreground [animation-delay:0.4s]" />
      </span>
      {label}
    </div>
  );
}
