"use client";

import type { ReactNode } from "react";
import type { ChatMessage } from "@/lib/types";
import DailyBriefCard from "./DailyBriefCard";
import { STANCE_LABEL } from "./derive";
import { LINK, dayLabel, oneLine, titleOf } from "./feedText";
import { clockTime, Markdown, money } from "./format";
import Sources from "./Sources";
import { FeedRow, OriginTag } from "./ui";
import { companyHref } from "./views";

interface Line {
  kind: string;
  live?: boolean;
  text: ReactNode;
  body: ReactNode;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${LINK} text-sm`}>
      {children} →
    </a>
  );
}

/** What a card says in one line, and what opens under it. Research and what-if cards live in Research, so they link there. */
function describe(m: ChatMessage): Line {
  if (m.kind === "research" && m.research) {
    const r = m.research;
    return {
      kind: "Research",
      text: `${r.ticker} · ${STANCE_LABEL[r.stance]}${r.confidenceScore != null ? ` · ${r.confidenceScore}/100` : ""}`,
      body: (
        <>
          <p>{oneLine(r.thesis, 240)}</p>
          <Link href={companyHref(r.ticker)}>Open {r.ticker} in Research</Link>
        </>
      ),
    };
  }
  if (m.kind === "scenario" && m.scenario) {
    return {
      kind: "What-if",
      text: m.scenario.headline || m.scenario.scenario,
      body: (
        <>
          <p>{oneLine(m.scenario.recommendation, 240)}</p>
          <Link href="#research/scenarios">Open the what-ifs</Link>
        </>
      ),
    };
  }
  if (m.kind === "ideas" && m.ideas) {
    const i = m.ideas;
    return {
      kind: "Ideas",
      text: oneLine(i.prompt, 90),
      body: (
        <>
          <p>{i.status === "asking" ? "Waiting for your answers." : i.summary}</p>
          {i.ideas.length > 0 && <p className="text-muted-foreground">{i.ideas.map((x) => x.ticker).join(", ")}</p>}
          <Link href={`#ideas/${m.id}`}>Open on Ideas</Link>
        </>
      ),
    };
  }
  if (m.kind === "constraint") {
    if (!m.resolved) {
      return {
        kind: "Needs you",
        text: titleOf(m),
        body: (
          <>
            <p>This one is still waiting for your yes or no.</p>
            <Link href="#decisions">Go to Decisions</Link>
          </>
        ),
      };
    }
    return {
      kind: "Decided",
      text: (
        <>
          {titleOf(m)} · <span className="text-muted-foreground">You chose: {m.resolved}</span>
        </>
      ),
      body: (
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
      ),
    };
  }
  if (m.kind === "receipt") {
    const live = m.mode === "live";
    return {
      kind: live ? "Real trade · real money" : "Paper trade",
      live,
      text: titleOf(m),
      body: (
        <>
          <Markdown text={m.text} />
          <Link href={live ? "#portfolio/orders" : "#portfolio/paper"}>{live ? "See your orders" : "See your paper account"}</Link>
        </>
      ),
    };
  }
  if (m.kind === "daily" && m.daily) {
    const b = m.daily;
    return {
      kind: "Brief",
      text: `${dayLabel(m.createdAt)} · ${money(b.portfolio.total, 0)} · ${oneLine(b.summary || m.text, 80)}`,
      body: <DailyBriefCard m={m} b={b} expanded />,
    };
  }
  return {
    kind: "Alert",
    text: titleOf(m),
    body: (
      <>
        <Markdown text={m.text} />
        <Sources sources={m.sources} max={5} />
      </>
    ),
  };
}

export default function HistoryRow({ m }: { m: ChatMessage }) {
  const line = describe(m);
  return (
    <FeedRow
      kind={line.kind}
      tone={line.live ? "live" : undefined}
      time={<time dateTime={m.createdAt}>{clockTime(m.createdAt)}</time>}
      text={
        <>
          {line.text} <OriginTag origin={m.origin} />
        </>
      }
    >
      {line.body}
    </FeedRow>
  );
}
