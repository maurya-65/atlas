"use client";

import { money } from "./format";
import type { ViewProps } from "./viewProps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";

export default function SafetyCard({ atlas }: Pick<ViewProps, "atlas">) {
  const { limits } = atlas.state;
  return (
    <Card id="safety">
      <CardHeader>
        <CardTitle>What Atlas can never do</CardTitle>
        <CardDescription>These limits are built into Atlas itself. They are not settings, so no mistake or message can switch them off.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>It never trades by itself. Every trade happens only when you click a decision card.</li>
          <li>A card can be decided once, so a double click can’t trade twice.</li>
          <li>The morning check only ever suggests paper trades, even in live mode.</li>
          <li>A hosted copy of Atlas stays in paper mode.</li>
          <li>Real-money orders are capped as shown below, whatever a card says.</li>
        </ul>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Most per trade</dt>
            <dd className="text-lg font-semibold tabular-nums">{money(limits.perTrade, 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Most per day</dt>
            <dd className="text-lg font-semibold tabular-nums">{money(limits.perDay, 0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Used today</dt>
            <dd className="text-lg font-semibold tabular-nums">{money(limits.usedToday)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
