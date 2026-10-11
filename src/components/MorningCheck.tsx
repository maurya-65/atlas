"use client";

import { briefs } from "./derive";
import { friendlyTime } from "./DailyBriefCard";
import { pct, timeAgo } from "./format";
import type { ViewProps } from "./viewProps";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Switch, Table, Td, Th, Tr } from "./ui";

/** The host's timer fires once a day at this time (vercel.json says 13:00 UTC). */
const HOST_RUN_UTC = { hour: 13, minute: 0 };

const DEPTH_CHOICES = [
  { value: 0, label: "Off (brief only)" },
  { value: 1, label: "1 stock" },
  { value: 2, label: "2 stocks" },
  { value: 3, label: "3 stocks" },
];

const clockLabel = (date: Date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? hhmm : clockLabel(new Date(2000, 0, 1, h, m));
}

/** The host runs once a day at a fixed time; say it in the visitor's own clock. */
const hostRunLocal = () => clockLabel(new Date(Date.UTC(2000, 0, 1, HOST_RUN_UTC.hour, HOST_RUN_UTC.minute)));

export default function MorningCheck({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions, jobs } = atlas;
  const daily = state.daily;
  if (!daily) return null;

  const running = daily.running || jobs.running.some((j) => j.kind === "morning");
  const latestBrief = briefs(state.messages)[0];

  return (
    <Card id="morning-check">
      <CardHeader>
        <CardTitle>Morning check</CardTitle>
        <CardDescription>
          Once a day Atlas looks at your portfolio, checks your rules, and can research the next stock on the list. It leaves a brief on Home, and a
          suggestion to approve or skip if it has one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <span className="font-medium">Run every day</span>
              <Switch checked={daily.enabled} onChange={(e) => actions.setMorningCheck({ enabled: e.target.checked })} />
            </label>

            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Next check</dt>
                <dd className="mt-0.5 font-medium">{daily.enabled && daily.nextRunAt ? friendlyTime(daily.nextRunAt) : "Off"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last check</dt>
                <dd className="mt-0.5 font-medium">{timeAgo(daily.lastRunAt)}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-3">
              {daily.hostTimer ? (
                <p className="col-span-2 text-sm text-muted-foreground">Runs once a day at about {hostRunLocal()} your time (set by the host).</p>
              ) : (
                <label className="block text-xs text-muted-foreground">
                  Time of day
                  <Input
                    type="time"
                    value={daily.time}
                    onChange={(e) => e.target.value && actions.setMorningCheck({ time: e.target.value })}
                    className="mt-1 text-foreground"
                    aria-label={`Time of day, now ${clock12(daily.time)}`}
                  />
                </label>
              )}
              <label className="col-span-2 block text-xs text-muted-foreground">
                Research up to
                <Select value={daily.depth} onChange={(e) => actions.setMorningCheck({ depth: Number(e.target.value) })} className="mt-1 text-foreground">
                  {DEPTH_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <Button onClick={actions.runMorningCheck} disabled={running} className="w-full">
              {running ? "Morning check in progress…" : "Run it now"}
            </Button>
            {daily.depth > 0 && <p className="text-xs text-muted-foreground">Running it now also researches {daily.depth === 1 ? "one stock" : `${daily.depth} stocks`}, which takes a few minutes.</p>}
            {latestBrief && (
              <a href="#history" className="block text-sm font-medium underline decoration-white/25 underline-offset-4 hover:decoration-white">
                See the latest brief in History
              </a>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium">Research order</h3>
            <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
              {daily.watch.length === 0
                ? "Your holdings appear here once your brokerage loads."
                : daily.depth > 0
                  ? `${daily.watch[0].ticker} is next, because it has gone longest without research. The list follows your holdings by itself.`
                  : "Research is off, so this list is only a preview of the order."}
            </p>
            {daily.watch.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Stock</Th>
                    <Th>Share of portfolio</Th>
                    <Th>Last researched</Th>
                  </tr>
                </thead>
                <tbody>
                  {daily.watch.map((w, i) => (
                    <Tr key={w.ticker}>
                      <Td>
                        <div className="flex items-center gap-2 font-semibold">
                          {w.ticker}
                          {i === 0 && daily.depth > 0 && <Badge variant="soft">Next</Badge>}
                        </div>
                        {w.name && <div className="max-w-52 truncate text-xs text-muted-foreground">{w.name}</div>}
                      </Td>
                      <Td className="tabular-nums">{pct(w.weight, 0)}</Td>
                      <Td className="text-muted-foreground">{w.lastResearchedAt ? timeAgo(w.lastResearchedAt) : "never"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
