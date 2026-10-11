"use client";

import { useMemo } from "react";
import { decidedDecisions, pendingDecisions, receipts } from "./derive";
import DecisionLedger from "./DecisionLedger";
import { ledger } from "./ledger";
import { InboxIcon } from "./icons";
import { MessageView } from "./Messages";
import { buttonClass, Empty, PageIntro } from "./ui";
import type { ViewProps } from "./viewProps";

const HEADING = "px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase";

export default function DecisionsView({ atlas }: ViewProps) {
  const { messages } = atlas.state;
  const waiting = pendingDecisions(messages);
  const entries = useMemo(() => ledger(decidedDecisions(messages), receipts(messages)), [messages]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageIntro
        what="Trades and suggestions that need your yes or no. Nothing is bought or sold unless you click, and paper trades use no real money."
        now={waiting.length > 0 ? `${waiting.length} waiting for you` : "Nothing is waiting for you."}
        actions={
          <a href="#watching" className={buttonClass("outline", "sm")}>
            What Atlas watches
          </a>
        }
      />

      <section aria-label="Waiting for you" className="space-y-3">
        <h2 className={HEADING}>Waiting for you · {waiting.length}</h2>
        {waiting.length > 0 ? (
          waiting.map((m) => <MessageView key={m.id} m={m} onChoose={(id, i) => atlas.actions.choose(id, i)} busy={Boolean(atlas.choosing)} />)
        ) : (
          <Empty icon={<InboxIcon />} title="Nothing is waiting for you.">
            When Atlas finds something that needs a decision, it shows up here and the number appears next to Decisions in the sidebar.
          </Empty>
        )}
      </section>

      <section aria-label="What you decided" className="space-y-3">
        <h2 className={HEADING}>What you decided · {entries.length}</h2>
        {entries.length > 0 ? (
          <DecisionLedger entries={entries} />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">Nothing yet. Each choice you make on a card is kept here with what came of it.</p>
        )}
      </section>
    </div>
  );
}
