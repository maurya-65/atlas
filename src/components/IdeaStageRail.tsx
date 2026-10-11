import type { IdeaEvent, IdeaStage } from "@/lib/types";
import { cn } from "./ui";

const STAGES: { id: IdeaStage; label: string }[] = [
  { id: "understanding", label: "Understanding your goal" },
  { id: "asking", label: "Asking you" },
  { id: "scanning", label: "Scanning candidates" },
  { id: "checking", label: "Checking the numbers" },
  { id: "weighing", label: "Weighing risks" },
  { id: "done", label: "Your ideas" },
];

/** The steps of an Ideas search, with the candidates appearing and being crossed out as they are screened. */
export default function IdeaStageRail({ events }: { events: IdeaEvent[] }) {
  const current = Math.max(0, STAGES.findIndex((s) => s.id === events.at(-1)?.stage));
  const latest = new Map<string, IdeaEvent>();
  for (const e of events) if (e.ticker) latest.set(e.ticker, e);

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map((stage, i) => {
          const state = i < current ? "done" : i === current ? "now" : "next";
          return (
            <li key={stage.id} className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm", state === "now" ? "border-white/25 bg-white/[0.1] font-medium" : "border-white/[0.08]", state === "next" && "text-muted-foreground")}>
              <span
                aria-hidden
                className={cn("grid size-4 shrink-0 place-items-center rounded-full border text-[10px]", state === "done" ? "border-white/60 bg-white text-black" : state === "now" ? "animate-pulse border-white bg-white/80" : "border-white/25")}
              >
                {state === "done" && "✓"}
              </span>
              {stage.label}
            </li>
          );
        })}
      </ol>
      {latest.size > 0 && (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {[...latest.values()].map((e) => (
            <li key={e.ticker} className={cn("flex min-w-0 items-baseline gap-2 rounded-xl border border-white/[0.08] px-3 py-1.5 text-sm", e.status === "dropped" && "text-muted-foreground")}>
              <span className={cn("shrink-0 font-semibold", e.status === "dropped" && "line-through")}>{e.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{e.status === "kept" ? "Numbers check out" : e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
