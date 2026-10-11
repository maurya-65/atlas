"use client";

import { money, signedPct } from "./format";
import { ClockIcon, DollarIcon, FlagIcon } from "./icons";
import { formatWhen, type PaperData } from "./paperData";
import { Badge, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Empty, StatTile, Table, Td, Th, Tr } from "./ui";
import type { TradeEffect } from "@/lib/paper";

/** "+$12.40" / "−$3.10": the sign carries the meaning, not colour. */
function signedMoney(n: number): string {
  if (Math.abs(n) < 0.005) return money(0);
  return `${n < 0 ? "−" : "+"}${money(Math.abs(n))}`;
}

const describe = (t: TradeEffect | null) => (t ? `${t.side === "BUY" ? "Buy" : "Sell"} of ${t.ticker}, ${signedMoney(t.effect)}` : "—");

export default function PerformanceTab({ data }: { data: PaperData | null }) {
  if (!data) return <p className="px-1 text-sm text-muted-foreground">Loading…</p>;
  const { performance } = data;
  const empty = performance.trades.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <Card>
        <CardHeader>
          <CardTitle>What your approved suggestions did</CardTitle>
          <CardDescription>
            For each paper trade, how much better or worse off you are than if you had not made it, at today’s prices. A buy gains when the shares are worth more now. A sell gains when they are worth less now.
          </CardDescription>
          <CardAction>
            <Badge variant="paper">Practice</Badge>
          </CardAction>
        </CardHeader>
      </Card>

      {empty ? (
        <Card>
          <CardContent>
            <Empty icon={<ClockIcon />} title="No paper trades to measure yet">
              Approve a suggestion in Decisions and its result shows up here, with today’s price against the price you got.
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            <StatTile icon={<DollarIcon />} label="All paper trades" value={signedMoney(performance.total)}>
              Across {performance.trades.length} trade{performance.trades.length === 1 ? "" : "s"}. Practice money only.
            </StatTile>
            <StatTile icon={<FlagIcon />} label="Best so far" value={performance.best ? signedMoney(performance.best.effect) : "—"}>
              {describe(performance.best)}
            </StatTile>
            <StatTile icon={<FlagIcon />} label="Worst so far" value={performance.worst ? signedMoney(performance.worst.effect) : "—"}>
              {performance.worst ? describe(performance.worst) : "Shows once there are two trades."}
            </StatTile>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trade by trade</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </CardHeader>
            <Table>
              <thead>
                <tr>
                  <Th>Trade</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="hidden text-right sm:table-cell">Price then</Th>
                  <Th className="text-right">Price now</Th>
                  <Th className="text-right">Effect</Th>
                </tr>
              </thead>
              <tbody>
                {performance.trades.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <div className="font-semibold">
                        {t.side === "BUY" ? "Bought" : "Sold"} {t.ticker}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatWhen(t.createdAt)}</div>
                    </Td>
                    <Td className="text-right tabular-nums">{money(t.dollars)}</Td>
                    <Td className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{money(t.priceThen)}</Td>
                    <Td className="text-right tabular-nums">{money(t.priceNow)}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {signedMoney(t.effect)}
                      <div className="text-xs font-normal text-muted-foreground">{signedPct(t.effectPct)}</div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
