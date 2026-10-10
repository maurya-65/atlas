"use client";

import { useState } from "react";
import type { ChatThread } from "@/lib/types";
import { XIcon } from "./icons";
import { Button, buttonClass, cn } from "./ui";

/** The list of chats: a column on wide screens, a strip you can scroll sideways on narrow ones. */
export function ThreadList({
  threads,
  activeId,
  onDelete,
}: {
  threads: ChatThread[];
  activeId: string | null;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <nav
      aria-label="Chats"
      className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/[0.08] px-3 py-2 md:w-60 md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:p-3"
    >
      <a href="#chat" className={cn(buttonClass(activeId ? "outline" : "default", "sm"), "shrink-0 md:w-full")}>
        New chat
      </a>
      <ul className="flex gap-1.5 md:flex-col">
        {threads.map((t) => (
          <li key={t.id} className="group relative shrink-0">
            {confirming === t.id ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/12 px-2.5 py-1.5 text-xs">
                <span className="whitespace-nowrap">Delete this chat?</span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setConfirming(null);
                    onDelete(t.id);
                  }}
                >
                  Delete
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>
                  Keep
                </Button>
              </div>
            ) : (
              <>
                <a
                  href={`#chat/${t.id}`}
                  aria-current={t.id === activeId ? "page" : undefined}
                  className={cn(
                    "block max-w-52 truncate rounded-xl border border-transparent py-1.5 pr-8 pl-2.5 text-sm transition-colors md:max-w-none",
                    t.id === activeId ? "border-white/10 bg-white/[0.09] font-medium text-foreground" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                  )}
                >
                  {t.title}
                </a>
                <button
                  type="button"
                  onClick={() => setConfirming(t.id)}
                  className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-60 transition-opacity hover:bg-white/[0.1] hover:text-foreground hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <XIcon className="size-3.5" />
                  <span className="sr-only">Delete chat: {t.title}</span>
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

const CHIP =
  "min-h-8 max-w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-left text-xs text-muted-foreground backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

const ASK_EXAMPLES = ["What is my biggest risk right now?", "What does an index fund do?"];
const WHAT_IF_EXAMPLES = ["What if Tesla cuts prices again?", "What if new crypto regulation hits Bitcoin?"];
const SECTOR_EXAMPLES = ["Semiconductors", "Electric vehicles"];

/** What a new chat shows: what Atlas can do, with an example of each that runs when clicked. */
export function ChatStart({
  tickers,
  canReview,
  disabled,
  onAsk,
  onResearch,
  onSector,
  onWhatIf,
  onReview,
}: {
  /** The user's biggest company stocks */
  tickers: string[];
  canReview: boolean;
  disabled: boolean;
  onAsk: (question: string) => void;
  onResearch: (ticker: string) => void;
  onSector: (sector: string) => void;
  onWhatIf: (scenario: string) => void;
  onReview: () => void;
}) {
  const groups = [
    {
      title: "Ask a question",
      text: "A quick answer from your holdings and your rules. It doesn't read the news.",
      chips: ASK_EXAMPLES.map((q) => ({ label: q, run: () => onAsk(q) })),
    },
    {
      title: "Research a stock",
      text: "Four analysts read filings, news and the web, argue it out, and give a verdict. It takes a minute or two.",
      chips: [
        ...tickers.slice(0, 2).map((t) => ({ label: `Research ${t}`, run: () => onResearch(t) })),
        ...SECTOR_EXAMPLES.slice(0, 1).map((s) => ({ label: `Research the ${s} sector`, run: () => onSector(s) })),
      ],
    },
    {
      title: "What if…",
      text: "Describe an event and Atlas traces how it could reach your holdings, with a rough dollar range.",
      chips: WHAT_IF_EXAMPLES.map((q) => ({ label: q, run: () => onWhatIf(q) })),
    },
    {
      title: "Review my portfolio",
      text: "Researches your three biggest stocks, one after another.",
      chips: canReview ? [{ label: "Review my portfolio", run: onReview }] : [],
      empty: "Needs holdings: connect a brokerage under Settings first.",
    },
  ];

  return (
    <div className="py-6 sm:py-10">
      <h2 className="text-center text-xl font-semibold tracking-tight">What would you like to know?</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
        Type below, or start with one of these. Nothing is bought or sold unless you approve it on a card.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className="glass rounded-2xl p-4 text-sm">
            <h3 className="font-semibold">{g.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {g.chips.map((c) => (
                <button key={c.label} type="button" onClick={c.run} disabled={disabled} className={CHIP}>
                  {c.label}
                </button>
              ))}
              {g.chips.length === 0 && g.empty && <p className="text-xs text-muted-foreground">{g.empty}</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
