"use client";

import { useMemo, type ReactNode } from "react";
import { isResearchableStock, type ChatMessage } from "@/lib/types";
import DailyBriefCard, { friendlyTime } from "./DailyBriefCard";
import DailyPanel from "./DailyPanel";
import { type AppState, money, pct, signedPct, timeAgo } from "./format";
import { ClockIcon, DollarIcon, FlagIcon, PieIcon, WalletIcon } from "./icons";
import type { SwitchMode } from "./ModeControl";
import { SAMPLE_FLAGS, SAMPLE_PORTFOLIO, sampleBrief, sampleWatch } from "./sample";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  SampleTag,
  StatTile,
  Table,
  Td,
  Th,
  Tr,
  buttonClass,
  cn,
} from "./ui";

export interface ViewProps {
  state: AppState;
  busy: boolean;
  onResearch: (ticker: string) => void;
  onScan: () => void;
  onReview: () => void;
  onRunDaily: () => void;
  onSetDaily: (patch: { enabled?: boolean; time?: string; depth?: number }) => Promise<void>;
  /** Resolves when the pasted Claude report became a card; throws a plain-words error otherwise */
  onImport: (text: string) => Promise<void>;
  onSetInterests: (interests: string[]) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  /** Throws a plain-words error when the rule isn't valid */
  onAddRule: (rule: { kind: string; threshold: number; ticker?: string }) => Promise<void>;
  onClearMemory: () => Promise<void>;
  onSelectAccount: (id: string) => Promise<void>;
  /** Paper / live switch; going live needs the typed confirmation */
  onSwitchMode: SwitchMode;
  /** Clear the conversation and start the demo over */
  onReset: () => void;
  onSignOut: () => void;
}

const LINK = "font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white";

function latestBrief(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((m) => m.kind === "daily" && m.daily);
}

/** One line under a "Sample" tag: says the content is made up and what replaces it. */
function SampleNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

/** Check-now and review buttons, on the Portfolio page. */
export function QuickActions({ state, busy, onScan, onReview }: Pick<ViewProps, "state" | "busy" | "onScan" | "onReview">) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Check on things</CardTitle>
        <CardDescription>Results land in a chat or in your Inbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Button onClick={onReview} disabled={busy || !state.portfolio?.holdings.length} className="w-full">
            Review my portfolio
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Researches your 3 biggest holdings in a new chat, with a buy more / sell some / hold verdict for each.
          </p>
        </div>
        <div>
          <Button variant="outline" onClick={onScan} disabled={busy} className="w-full">
            Check now
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Reads the latest news and filings about what you hold and checks your rules. Findings land in your Inbox. Last check: {timeAgo(state.lastScanAt)}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Overview ---------- */

export function OverviewView({ state, busy, onResearch, onScan, onReview }: ViewProps) {
  // Real numbers when the account has holdings; otherwise a clearly tagged sample. The two are never mixed.
  const real = state.portfolio && state.portfolio.holdings.length > 0 ? state.portfolio : null;
  const sample = !real;
  const p = real ?? SAMPLE_PORTFOLIO;
  const holdings = [...p.holdings].sort((a, b) => b.value - a.value);
  const biggest = holdings[0];
  const daily = state.daily;
  const brief = latestBrief(state.messages);
  const open = state.messages.filter((m) => m.kind === "constraint" && !m.resolved);
  const total = p.total > 0 ? p.total : 0;
  const sampleTag = sample ? <SampleTag /> : undefined;
  const marker = sample ? (
    sampleTag
  ) : p.source === "snaptrade" ? (
    <Badge variant="soft">From your broker</Badge>
  ) : p.source === "paper" ? (
    <Badge variant="paper">Simulated</Badge>
  ) : (
    <Badge variant="secondary">Demo numbers</Badge>
  );
  const sampleLine = "Sample figure. Your real number replaces it once your brokerage loads.";

  // Allocation: one bar per holding plus cash, as a share of everything.
  const slices = total
    ? [
        ...holdings.map((h, i) => ({ label: h.ticker, share: h.value / total, kind: i === 0 ? ("top" as const) : ("stock" as const) })),
        ...(p.cash > 0 ? [{ label: "Cash", share: p.cash / total, kind: "cash" as const }] : []),
      ]
    : [];
  const maxShare = Math.max(...slices.map((s) => s.share), 0.0001);
  const flags = brief?.daily ? brief.daily.flags : sample ? SAMPLE_FLAGS : [];
  const sampleFlags = !brief?.daily && sample;

  return (
    <div className="grid gap-4 sm:gap-5">
      {sample && (
        <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-muted-foreground">
          <SampleTag />
          <span>
            Made-up numbers to show how this page looks. Your real portfolio replaces them once your brokerage loads.{" "}
            <a href="#settings" className={LINK}>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
        <StatTile icon={<DollarIcon />} label="Portfolio value" marker={marker} value={money(p.total)}>
          {sample ? sampleLine : p.sourceLabel}
        </StatTile>
        <StatTile icon={<WalletIcon />} label="Cash" marker={sampleTag} value={money(p.cash)}>
          {sample ? sampleLine : total ? `${pct(p.cash / total, 0)} of your portfolio is not invested.` : "Money not invested in any stock."}
        </StatTile>
        <StatTile icon={<PieIcon />} label="Biggest position" marker={sampleTag} value={biggest ? biggest.ticker : "—"}>
          {sample
            ? sampleLine
            : biggest && total
              ? `${pct(biggest.value / total, 0)} of everything you own (${money(biggest.value, 0)}).`
              : "No stocks held yet."}
        </StatTile>
        <StatTile
          icon={<ClockIcon />}
          label="Next daily run"
          marker={daily?.running ? <Badge variant="soft">Running now</Badge> : undefined}
          value={daily?.enabled && daily.nextRunAt ? friendlyTime(daily.nextRunAt) : "Off"}
        >
          {daily?.enabled ? `Last run: ${timeAgo(daily.lastRunAt)}.` : "Atlas only checks when you ask."}{" "}
          <a href="#daily" className={LINK}>
            Change schedule
          </a>
        </StatTile>
      </div>

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-3">
        <div className="grid gap-4 sm:gap-5 xl:col-span-2">
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
                        className={cn(
                          "w-full rounded-lg",
                          s.kind === "top" ? "bg-white" : s.kind === "cash" ? "border border-dashed border-white/30 bg-white/[0.06]" : "bg-white/30",
                        )}
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
              <CardDescription>{sample ? "Sample holdings. Yours replace them once your brokerage loads." : "Biggest first."}</CardDescription>
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
                  {/* Sample rows are display-only: no actions. */}
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
                      <div className="font-semibold">{h.ticker}</div>
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
                          <Button variant="outline" size="sm" onClick={() => onResearch(h.ticker)} disabled={busy} title={`Research ${h.name || h.ticker}`}>
                            Research<span className="sr-only"> {h.ticker}</span>
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
                <details className="text-sm">
                  <summary className="font-medium text-muted-foreground hover:text-foreground">Recent orders at your broker</summary>
                  <ul className="mt-2 space-y-1">
                    {p.recentOrders.map((o, i) => (
                      <li key={i}>
                        {o.action} {o.quantity} {o.ticker} — {o.status.toLowerCase()}
                        {o.time && <span className="text-muted-foreground"> ({timeAgo(o.time)})</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-4 sm:gap-5">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Waiting for you</CardTitle>
              <CardAction>
                <a href="#inbox" className={buttonClass("outline", "xs")}>
                  Open the inbox
                </a>
              </CardAction>
            </CardHeader>
            <CardContent>
              {open.length === 0 ? (
                <p className="text-muted-foreground">Nothing needs a decision right now.</p>
              ) : (
                <ul className="space-y-2.5">
                  {open.slice(-4).map((m) => (
                    <li key={m.id} className="flex items-start gap-2.5">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white" />
                      <span>{m.title || m.text.slice(0, 80)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>What your rules flagged</CardTitle>
              {sampleFlags && (
                <CardAction>
                  <SampleTag />
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {flags.length > 0 ? (
                <ul className="space-y-2.5">
                  {flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <FlagIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {brief?.daily ? "The latest daily brief found nothing over your limits." : "No daily brief yet. Run one from Daily run, or press Check now in the Inbox."}
                </p>
              )}
              {sampleFlags && <SampleNote className="mt-3">Made-up examples. Real flags replace them after the first daily run.</SampleNote>}
              {brief?.daily && <p className="mt-3 text-xs text-muted-foreground">From the latest daily brief ({timeAgo(brief.createdAt)}).</p>}
            </CardContent>
          </Card>

          <QuickActions state={state} busy={busy} onScan={onScan} onReview={onReview} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Daily run ---------- */

export function DailyView({ state, busy, onSetDaily, onRunDaily }: ViewProps) {
  const daily = state.daily;
  const brief = latestBrief(state.messages);
  const sampleWatchList = useMemo(() => sampleWatch(), []);
  const sample = useMemo(() => sampleBrief(), []);
  const watchIsSample = Boolean(daily) && daily!.watch.length === 0;
  const watch = daily ? (watchIsSample ? sampleWatchList : daily.watch) : [];
  return (
    <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-3">
      <div className="grid gap-4 sm:gap-5">
        <DailyPanel daily={daily} busy={busy} onChange={onSetDaily} onRun={onRunDaily} />
        {!daily && (
          <Card>
            <CardContent>
              <Empty icon={<ClockIcon />} title="The daily run isn’t available.">
                This server didn’t send a schedule.
              </Empty>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="grid gap-4 sm:gap-5 xl:col-span-2">
        {daily && (
          <Card>
            <CardHeader>
              <CardTitle>Watch list</CardTitle>
              <CardDescription>
                {watchIsSample
                  ? "Sample list. Your own holdings replace it once your brokerage loads; a stock you buy joins by itself."
                  : "In the order the daily run will research it. The list follows your holdings automatically."}
              </CardDescription>
              {watchIsSample && (
                <CardAction>
                  <SampleTag />
                </CardAction>
              )}
            </CardHeader>
            <Table>
              <thead>
                <tr>
                  <Th>Stock</Th>
                  <Th>Share of portfolio</Th>
                  <Th>Last researched</Th>
                </tr>
              </thead>
              <tbody>
                {watch.map((w, i) => (
                  <Tr key={w.ticker}>
                    <Td>
                      <div className="flex items-center gap-2 font-semibold">
                        {w.ticker}
                        {i === 0 && daily.depth > 0 && !watchIsSample && <Badge variant="soft">Next</Badge>}
                      </div>
                      {w.name && <div className="max-w-52 truncate text-xs text-muted-foreground">{w.name}</div>}
                    </Td>
                    <Td className="tabular-nums">{pct(w.weight, 0)}</Td>
                    <Td className="text-muted-foreground">{timeAgo(w.lastResearchedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        <div>
          <h2 className="mb-2 px-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Latest brief</h2>
          {brief?.daily ? <DailyBriefCard m={brief} b={brief.daily} expanded /> : <DailyBriefCard m={sample.m} b={sample.b} expanded sample />}
        </div>
      </div>
    </div>
  );
}

