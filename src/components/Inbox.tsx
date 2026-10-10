"use client";

import { Fragment, useState, type ReactNode, type RefObject } from "react";
import type { ChatMessage } from "@/lib/types";
import { MessageView } from "./Messages";
import { Button } from "./ui";

type Filter = "all" | "decide" | "research" | "daily";

function matches(m: ChatMessage, filter: Filter): boolean {
  if (filter === "decide") return m.kind === "constraint" && !m.resolved;
  if (filter === "research") return m.kind === "research" || m.kind === "scenario";
  if (filter === "daily") return m.kind === "daily";
  return true;
}

const dayKey = (iso: string) => new Date(iso).toDateString();

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const SECTION = "px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase";

/** What Atlas found on its own, newest first: scan results, rule alerts, daily briefs, and trades waiting for a yes or no. */
export default function Inbox({
  messages,
  busy,
  onChoose,
  onScan,
  top,
  scrollRef,
}: {
  /** Messages that don't belong to a chat */
  messages: ChatMessage[];
  busy: boolean;
  onChoose: (messageId: string, optionIndex: number) => Promise<void>;
  onScan: () => void;
  /** Notices and the live view of a run in progress */
  top: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const newestFirst = [...messages].reverse();
  const isOpen = (m: ChatMessage) => m.kind === "constraint" && !m.resolved;
  const open = filter === "all" || filter === "decide" ? newestFirst.filter(isOpen) : [];
  const activity = filter === "decide" ? [] : newestFirst.filter((m) => !isOpen(m) && matches(m, filter));
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "decide", label: `Needs your decision (${messages.filter(isOpen).length})` },
    { id: "research", label: "Research" },
    { id: "daily", label: "Daily" },
  ];

  return (
    <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="shrink-0 space-y-3 px-3 pt-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-60 flex-1 text-sm text-muted-foreground">
            What Atlas finds on its own: news about what you hold, rules that were crossed, daily briefs, and trades waiting for your yes or no.
            Nothing is bought or sold unless you click.
          </p>
          <Button onClick={onScan} disabled={busy}>
            Check now
          </Button>
        </div>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5" role="group" aria-label="Show in the inbox">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-7 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.id
                  ? "border-white/20 bg-white/[0.12] text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="mt-3 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 sm:px-5" aria-live="polite">
        <section aria-label="Inbox" className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3 pt-2 pb-6">
          {top}

          {open.length > 0 && (
            <>
              <h2 className={`${SECTION} mt-2 text-foreground`}>Needs your decision · {open.length}</h2>
              {open.map((m) => (
                <MessageView key={m.id} m={m} onChoose={onChoose} busy={busy} />
              ))}
            </>
          )}

          {activity.length > 0 && (
            <>
              <h2 className={`${SECTION} mt-3`}>Activity</h2>
              {activity.map((m, i) => (
                <Fragment key={m.id}>
                  {i > 0 && dayKey(activity[i - 1].createdAt) !== dayKey(m.createdAt) && (
                    <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground" role="separator">
                      <span className="h-px flex-1 bg-white/[0.08]" />
                      {dayLabel(m.createdAt)}
                      <span className="h-px flex-1 bg-white/[0.08]" />
                    </div>
                  )}
                  <MessageView m={m} onChoose={onChoose} busy={busy} />
                </Fragment>
              ))}
            </>
          )}

          {open.length === 0 && activity.length === 0 && !busy && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {filter === "all"
                ? "Nothing here yet. Press Check now and Atlas reads the latest news and filings about what you hold and checks your rules."
                : "Nothing in this filter yet."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
