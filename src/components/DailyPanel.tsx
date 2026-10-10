"use client";

import type { DailyState } from "@/lib/types";
import { timeAgo } from "./format";
import { friendlyTime } from "./DailyBriefCard";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Switch } from "./ui";

function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The server accepts 0 to 3 stocks per run; anything else typed in the box is pulled back into that range. */
const MAX_DEPTH = 3;

export default function DailyPanel({
  daily,
  busy,
  onChange,
  onRun,
}: {
  daily?: DailyState;
  busy: boolean;
  onChange: (patch: { enabled?: boolean; time?: string; depth?: number }) => Promise<void>;
  onRun: () => void;
}) {
  if (!daily) return null;
  const nextUp = daily.watch[0]?.ticker;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>
          {daily.enabled
            ? `On. Every day at ${clock12(daily.time)} Atlas reviews your portfolio and posts a brief.`
            : "Off. Atlas only checks when you ask."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
          <span className="font-medium">Run every day</span>
          <Switch checked={daily.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        </label>

        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Next run</dt>
            <dd className="mt-0.5 font-medium">{daily.enabled && daily.nextRunAt ? friendlyTime(daily.nextRunAt) : "Off"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last run</dt>
            <dd className="mt-0.5 font-medium">{timeAgo(daily.lastRunAt)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted-foreground">
            Time of day
            <Input type="time" value={daily.time} onChange={(e) => e.target.value && onChange({ time: e.target.value })} className="mt-1 text-foreground" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Stocks to research per run (0–{MAX_DEPTH})
            <Input
              key={daily.depth}
              type="text"
              inputMode="numeric"
              defaultValue={daily.depth}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={(e) => {
                const typed = Number.parseInt(e.target.value, 10);
                const depth = Number.isNaN(typed) ? daily.depth : Math.max(0, Math.min(MAX_DEPTH, typed));
                e.target.value = String(depth);
                if (depth !== daily.depth) onChange({ depth });
              }}
              className="mt-1 text-foreground"
            />
          </label>
        </div>

        {daily.hostTimer && (
          <p className="text-xs text-muted-foreground">
            This copy of Atlas is hosted, so the run starts when the host’s once-a-day timer fires. That can be later than the time above.
          </p>
        )}

        {daily.watch.length > 0 && (
          <p>
            <span className="text-muted-foreground">Watching: </span>
            {daily.watch.map((w, i) => (
              <span key={w.ticker}>
                {i > 0 && ", "}
                {w.ticker}
                {w.ticker === nextUp && daily.depth > 0 && <span className="text-xs text-muted-foreground"> (next)</span>}
              </span>
            ))}
          </p>
        )}

        <Button onClick={onRun} disabled={busy || daily.running} className="w-full">
          {daily.running ? "Daily run in progress…" : "Run now"}
        </Button>
      </CardContent>
    </Card>
  );
}
