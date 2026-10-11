"use client";

import { useState } from "react";
import { money } from "./format";
import { DollarIcon, ResetIcon, WalletIcon } from "./icons";
import { describeTrade, formatWhen, type PaperData } from "./paperData";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Empty, StatTile, Table, Td, Th, Tr } from "./ui";
import type { Mode } from "@/lib/types";

/** "Start over" with a second click to confirm, so a paper account is never cleared by accident. */
function ResetButton({ onReset }: { onReset: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);

  if (!asking) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
        <ResetIcon />
        Reset paper account
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span>Clear your paper trades and start again from your connected account? Real orders are not touched.</span>
      <Button
        size="sm"
        disabled={working}
        onClick={async () => {
          setWorking(true);
          await onReset();
          setWorking(false);
          setAsking(false);
        }}
      >
        {working ? "Resetting…" : "Yes, reset"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={working}>
        Keep it
      </Button>
    </div>
  );
}

interface Props {
  data: PaperData | null;
  mode: Mode;
  onReset: () => Promise<void>;
}

export default function PaperTab({ data, mode, onReset }: Props) {
  if (!data) return <p className="px-1 text-sm text-muted-foreground">Loading your paper account…</p>;
  const { book } = data;
  const paperTrades = data.trades.filter((t) => t.mode === "paper");

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <Card>
        <CardHeader>
          <CardTitle>What paper means</CardTitle>
          <CardDescription>
            Paper is practice money. When you approve a trade, Atlas makes it on a copy of your account and nothing real moves
            {mode === "live" ? ", and the morning check’s suggestions always use the copy, even in live mode" : ""}. Prices are live, so you can see how a decision would have done.
          </CardDescription>
        </CardHeader>
      </Card>

      {!book ? (
        <Card>
          <CardContent>
            <Empty icon={<WalletIcon />} title="No paper account yet">
              It is made from your connected account the first time you open Portfolio in paper mode or approve a paper trade.
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            <StatTile icon={<DollarIcon />} label="Paper value" marker={<Badge variant="paper">Practice</Badge>} value={money(book.totalValue)}>
              Cash plus your positions at today’s prices.
            </StatTile>
            <StatTile icon={<WalletIcon />} label="Paper cash" value={money(book.cash)}>
              What is left to spend on paper trades.
            </StatTile>
            <StatTile icon={<ResetIcon />} label="Started from" value={book.seededFrom === "snaptrade" ? "Your account" : "Demo data"}>
              Copied on {formatWhen(book.seededAt)}.
            </StatTile>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Paper positions</CardTitle>
              <CardDescription>What you hold in the practice account.</CardDescription>
            </CardHeader>
            {book.positions.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">Nothing held. Everything is in cash.</p>
              </CardContent>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Stock</Th>
                    <Th className="text-right">Shares</Th>
                    <Th className="text-right">Avg cost</Th>
                    <Th className="text-right">Price now</Th>
                    <Th className="text-right">Value</Th>
                  </tr>
                </thead>
                <tbody>
                  {book.positions.map((p) => (
                    <Tr key={p.ticker}>
                      <Td>
                        <div className="font-semibold">{p.ticker}</div>
                        <div className="max-w-44 truncate text-xs text-muted-foreground">{p.name}</div>
                      </Td>
                      <Td className="text-right tabular-nums">{p.units.toFixed(p.units < 10 ? 4 : 2)}</Td>
                      <Td className="text-right text-muted-foreground tabular-nums">{money(p.avgCost)}</Td>
                      <Td className="text-right tabular-nums">{money(p.price)}</Td>
                      <Td className="text-right tabular-nums">{money(p.value, 0)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Paper trades</CardTitle>
          <CardDescription>Every trade you approved on paper, newest first.</CardDescription>
          <CardAction>
            <Badge variant="paper">Practice</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {paperTrades.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paper trades yet. When you approve a suggestion in Decisions, it shows up here.</p>
          ) : (
            <ul className="divide-y divide-white/[0.07]">
              {paperTrades.map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span>{describeTrade(t)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatWhen(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <ResetButton onReset={onReset} />
        </CardContent>
      </Card>
    </div>
  );
}
