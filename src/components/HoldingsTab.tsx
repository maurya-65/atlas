"use client";

import { isResearchableStock } from "@/lib/types";
import { money, pct, signedPct } from "./format";
import { DollarIcon, PieIcon, WalletIcon } from "./icons";
import { SAMPLE_PORTFOLIO } from "./sample";
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, SampleTag, StatTile, Table, Td, Th, Tr, cn } from "./ui";
import type { ViewProps } from "./viewProps";
import { companyHref } from "./views";

const LINK = "font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white";

export default function HoldingsTab({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, jobs, actions } = atlas;
  // Real numbers when the account has holdings, otherwise a clearly tagged sample; the two are never mixed.
  const real = state.portfolio && state.portfolio.holdings.length > 0 ? state.portfolio : null;
  const sample = !real;
  const p = real ?? SAMPLE_PORTFOLIO;
  const holdings = [...p.holdings].sort((a, b) => b.value - a.value);
  const biggest = holdings[0];
  const total = p.total > 0 ? p.total : 0;
  const sampleTag = sample ? <SampleTag /> : undefined;
  const sampleLine = "Sample figure. Your real number replaces it once your brokerage loads.";

  const marker = sample ? (
    sampleTag
  ) : p.source === "snaptrade" ? (
    <Badge variant="soft">From your broker</Badge>
  ) : p.source === "paper" ? (
    <Badge variant="paper">Paper</Badge>
  ) : (
    <Badge variant="secondary">Demo numbers</Badge>
  );

  const slices = total
    ? [
        ...holdings.map((h, i) => ({ label: h.ticker, share: h.value / total, kind: i === 0 ? ("top" as const) : ("stock" as const) })),
        ...(p.cash > 0 ? [{ label: "Cash", share: p.cash / total, kind: "cash" as const }] : []),
      ]
    : [];
  const maxShare = Math.max(...slices.map((s) => s.share), 0.0001);
  const researching = (ticker: string) => jobs.running.some((j) => j.kind === "research" && j.label === `Research on ${ticker}`);

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      {sample && (
        <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-muted-foreground">
          <SampleTag />
          <span>
            Made-up numbers to show how this page looks. Your real portfolio replaces them once your brokerage loads.{" "}
            <a href="#settings/brokerage" className={LINK}>
              Settings
            </a>
          </span>
          {state.portfolio && (
            <span className="w-full text-xs">
              Your account has {money(state.portfolio.cash)} in cash and no stocks yet ({state.portfolio.sourceLabel}).
            </span>
          )}
          {state.portfolioError && <span className="w-full text-xs text-live">Couldn’t load your brokerage: {state.portfolioError}</span>}
        </div>
      )}
      {!sample && state.portfolioError && <p className="text-xs text-live">Couldn’t refresh from your brokerage: {state.portfolioError}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        <StatTile icon={<DollarIcon />} label="Portfolio value" marker={marker} value={money(p.total)}>
          {sample ? sampleLine : p.sourceLabel}
        </StatTile>
        <StatTile icon={<WalletIcon />} label="Cash" marker={sampleTag} value={money(p.cash)}>
          {sample ? sampleLine : total ? `${pct(p.cash / total, 0)} of your portfolio is not invested.` : "Money not invested in any stock."}
        </StatTile>
        <StatTile icon={<PieIcon />} label="Biggest position" marker={sampleTag} value={biggest ? biggest.ticker : "—"}>
          {sample ? sampleLine : biggest && total ? `${pct(biggest.value / total, 0)} of everything you own (${money(biggest.value, 0)}).` : "No stocks held yet."}
        </StatTile>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allocation</CardTitle>
          <CardDescription>
            {sample
              ? "Sample allocation. Yours replaces it once your brokerage loads."
              : biggest && total
                ? `Where your money sits. ${biggest.ticker} is the biggest share, at ${pct(biggest.value / total, 0)}.`
                : "Where your money sits."}
          </CardDescription>
          {sample && (
            <CardAction>
              <SampleTag />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <ul className="flex items-end gap-2 sm:gap-4">
            {slices.map((s) => (
              <li key={s.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-sm font-semibold tabular-nums">{pct(s.share, 0)}</span>
                <div className="flex h-32 w-full max-w-16 items-end">
                  <div
                    className={cn("w-full rounded-lg", s.kind === "top" ? "bg-white" : s.kind === "cash" ? "border border-dashed border-white/30 bg-white/[0.06]" : "bg-white/30")}
                    style={{ height: `${Math.max(4, (s.share / maxShare) * 100)}%` }}
                  />
                </div>
                <span className="max-w-full truncate text-xs text-muted-foreground">{s.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{sample ? "Holdings" : "Your holdings"}</CardTitle>
          <CardDescription>{sample ? "Sample holdings. Yours replace them once your brokerage loads." : "Biggest first. Open a company to see everything Atlas knows about it."}</CardDescription>
          {sample && (
            <CardAction>
              <SampleTag />
            </CardAction>
          )}
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Stock</Th>
              <Th className="text-right">Value</Th>
              <Th className="text-right">Share</Th>
              <Th className="text-right">Since bought</Th>
              {!sample && (
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <Tr key={h.ticker}>
                <Td>
                  {sample || !isResearchableStock(h.ticker, h.kind) ? (
                    <div className="font-semibold">{h.ticker}</div>
                  ) : (
                    <a href={companyHref(h.ticker)} className="font-semibold hover:underline">
                      {h.ticker}
                    </a>
                  )}
                  {h.name && <div className="max-w-44 truncate text-xs text-muted-foreground">{h.name}</div>}
                </Td>
                <Td className="text-right tabular-nums">{money(h.value, 0)}</Td>
                <Td className="text-right text-muted-foreground tabular-nums">{total ? pct(h.value / total, 0) : "—"}</Td>
                <Td className={cn("text-right tabular-nums", h.pnlPct !== null && h.pnlPct > 0.0005 ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {h.pnlPct === null ? "cost unknown" : signedPct(h.pnlPct)}
                </Td>
                {!sample && (
                  <Td className="text-right">
                    {isResearchableStock(h.ticker, h.kind) && (
                      <Button variant="outline" size="sm" onClick={() => actions.research(h.ticker)} disabled={researching(h.ticker)} title={`Research ${h.name || h.ticker}`}>
                        {researching(h.ticker) ? "Researching…" : "Research"}
                        <span className="sr-only"> {h.ticker}</span>
                      </Button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
        {!sample && p.recentOrders.length > 0 && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {p.recentOrders.length} recent order{p.recentOrders.length === 1 ? "" : "s"} at your broker.{" "}
              <a href="#portfolio/orders" className={LINK}>
                See all orders
              </a>
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
