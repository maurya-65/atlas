"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import type { LedgerEntry, Outcome } from "./ledger";
import { dayLabel, LINK, titleOf } from "./feedText";
import { clockTime, Markdown } from "./format";
import Sources from "./Sources";
import { Button, FeedRow } from "./ui";

const PAGE = 20;

const KIND: Record<string, string> = {
  approve_trade: "Trade",
  research: "Research",
  what_if: "What-if",
  add_interest: "Topic",
  dismiss: "Dismissed",
};

const when = (iso: string) => `${dayLabel(iso)} · ${clockTime(iso)}`;

function WhatHappened({ outcome }: { outcome: Outcome }) {
  return (
    <p>
      <span className="font-semibold">What happened: </span>
      {outcome.text}
      {outcome.href && (
        <>
          {" "}
          <a href={outcome.href} className={LINK}>
            {outcome.linkLabel} →
          </a>
        </>
      )}
    </p>
  );
}

function CardText({ m }: { m: ChatMessage }) {
  return (
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
}

function Row({ entry }: { entry: LedgerEntry }) {
  if (entry.kind === "trade") {
    const m = entry.message;
    const live = m.mode === "live";
    return (
      <FeedRow kind={live ? "Real trade · real money" : "Paper trade"} tone={live ? "live" : undefined} time={when(entry.at)} text={titleOf(m)}>
        <Markdown text={m.text} />
        <a href={live ? "#portfolio/orders" : "#portfolio/paper"} className={`${LINK} text-sm`}>
          {live ? "See your orders" : "See your paper account"} →
        </a>
      </FeedRow>
    );
  }
  const { message: m, choice, outcome } = entry;
  return (
    <FeedRow
      kind={KIND[choice?.kind ?? ""] ?? "Decision"}
      time={when(entry.at)}
      text={
        <>
          {titleOf(m)} · <span className="text-muted-foreground">You chose: {m.resolved}</span>
        </>
      }
    >
      <WhatHappened outcome={outcome} />
      <CardText m={m} />
    </FeedRow>
  );
}

/** What the user decided before, newest first, with what came of each choice. */
export default function DecisionLedger({ entries }: { entries: LedgerEntry[] }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <div className="space-y-2">
      {entries.slice(0, shown).map((entry) => (
        <Row key={entry.message.id} entry={entry} />
      ))}
      {entries.length > shown && (
        <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({entries.length - shown} left)
        </Button>
      )}
    </div>
  );
}
