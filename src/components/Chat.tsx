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

const ASK_EXAMPLES = [
  "What is my biggest risk right now?",
  "How much of my money is in cash?",
  "What does an index fund do?",
  "What does diversified mean?",
];

/** What a new chat shows: a few questions to start with, and where research lives. */
export function ChatStart({ disabled, onAsk }: { disabled: boolean; onAsk: (question: string) => void }) {
  return (
    <div className="py-6 sm:py-10">
      <h2 className="text-center text-xl font-semibold tracking-tight">What would you like to know?</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
        Ask about your holdings, your rules or an investing term. Nothing is bought or sold unless you approve it on a card.
      </p>
      <section className="glass mx-auto mt-6 max-w-xl rounded-2xl p-4 text-sm">
        <h3 className="font-semibold">Try one of these</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {ASK_EXAMPLES.map((q) => (
            <button key={q} type="button" onClick={() => onAsk(q)} disabled={disabled} className={CHIP}>
              {q}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Want a full research on a company, a sector or a what-if? Start it on the{" "}
          <a href="#research/new" className="font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white">
            Research page
          </a>
          .
        </p>
      </section>
    </div>
  );
}
