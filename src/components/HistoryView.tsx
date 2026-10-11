"use client";

import { Fragment, useState } from "react";
import { historyItems, type HistoryFilter } from "./derive";
import { dayKey, dayLabel } from "./feedText";
import { timeAgo } from "./format";
import HistoryRow from "./HistoryRow";
import { Button, PageIntro } from "./ui";
import type { ViewProps } from "./viewProps";

const PAGE = 40;

const FILTERS: { id: HistoryFilter; label: string; empty: string }[] = [
  { id: "all", label: "All", empty: "Nothing yet. When Atlas researches something, checks your portfolio or you make a decision, it is listed here." },
  { id: "research", label: "Research", empty: "No research yet. Start one from the Research page." },
  { id: "ideas", label: "Ideas", empty: "No ideas yet. Ask for some on the Ideas page." },
  { id: "decisions", label: "Decisions", empty: "No decisions yet." },
  { id: "briefs", label: "Briefs", empty: "No briefs yet. The morning check writes one each time it runs." },
  { id: "trades", label: "Trades", empty: "No trades yet. Approved trades, paper or real, are listed here." },
  { id: "alerts", label: "Alerts", empty: "No alerts yet. When Atlas notices something about what you hold, it shows up here." },
];

export default function HistoryView({ atlas }: ViewProps) {
  const { messages } = atlas.state;
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const all = historyItems(messages);
  const items = filter === "all" ? all : historyItems(messages, filter);
  const visible = items.slice(0, shown);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageIntro
        what="Everything Atlas has done, newest first: research, decisions, briefs, trades and alerts. Chat stays in Chat."
        now={all.length > 0 ? `${all.length} entries, the latest ${timeAgo(all[0].createdAt)}.` : "Nothing yet."}
      />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show in History">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? all.length : historyItems(messages, f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setShown(PAGE);
              }}
              className={`h-7 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.id ? "border-white/20 bg-white/[0.12] text-foreground" : "border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{FILTERS.find((f) => f.id === filter)?.empty}</p>
      ) : (
        <section aria-label="History" className="space-y-2">
          {visible.map((m, i) => (
            <Fragment key={m.id}>
              {(i === 0 || dayKey(visible[i - 1].createdAt) !== dayKey(m.createdAt)) && (
                <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground" role="separator">
                  <span className="h-px flex-1 bg-white/[0.08]" />
                  {dayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-white/[0.08]" />
                </div>
              )}
              <HistoryRow m={m} />
            </Fragment>
          ))}
          {items.length > shown && (
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({items.length - shown} left)
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
