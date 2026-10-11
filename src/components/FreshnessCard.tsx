"use client";

import { timeAgo } from "./format";
import type { ViewProps } from "./viewProps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";

export default function FreshnessCard({ atlas }: Pick<ViewProps, "atlas">) {
  const { state } = atlas;
  const rows: [string, string][] = [
    ["Your portfolio", state.portfolio?.sourceLabel ?? "Not loaded"],
    ["Prices", "Live when this page loaded"],
    ["Last check for news and rules", timeAgo(state.lastScanAt)],
    ["Last morning check", timeAgo(state.daily?.lastRunAt)],
  ];
  return (
    <Card id="freshness">
      <CardHeader>
        <CardTitle>Where the information comes from</CardTitle>
        <CardDescription>News, SEC filings and government notices are read when Atlas checks, so they are only as new as the last check.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-white/[0.07]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
