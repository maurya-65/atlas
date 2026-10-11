"use client";

import { isResearchableStock } from "@/lib/types";
import { friendlyTime } from "./DailyBriefCard";
import type { AppState } from "./format";
import { money, pct, timeAgo } from "./format";
import { ClockIcon, DollarIcon, PieIcon, WalletIcon } from "./icons";
import { SAMPLE_PORTFOLIO } from "./sample";
import { Badge, SampleTag, StatTile } from "./ui";
import { companyHref } from "./views";

const LINK = "font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white";
const SAMPLE_LINE = "Sample figure. Your real number replaces it once your brokerage loads.";

function sourceBadge(source: "snaptrade" | "paper" | "demo") {
  if (source === "snaptrade") return <Badge variant="soft">From your broker</Badge>;
  if (source === "paper") return <Badge variant="paper">Paper</Badge>;
  return <Badge variant="secondary">Demo numbers</Badge>;
}

/** Value, cash, biggest position and the next morning check. Made-up sample numbers are tagged and never mixed with real ones. */
export default function HomeSnapshot({ state }: { state: AppState }) {
  const real = state.portfolio && state.portfolio.holdings.length > 0 ? state.portfolio : null;
  const sample = !real;
  const p = real ?? SAMPLE_PORTFOLIO;
  const biggest = [...p.holdings].sort((a, b) => b.value - a.value)[0];
  const total = p.total > 0 ? p.total : 0;
  const sampleTag = sample ? <SampleTag /> : undefined;
  const daily = state.daily;

  return (
    <section aria-label="Snapshot" className="space-y-3">
      {sample && (
        <p role="note" className="rounded-2xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-muted-foreground">
          Made-up numbers to show how this looks. Your real portfolio replaces them once your brokerage loads.{" "}
          <a href="#settings/brokerage" className={LINK}>
            Settings
          </a>
          {state.portfolioError && <span className="mt-1 block text-xs text-live">Couldn’t load your brokerage: {state.portfolioError}</span>}
        </p>
      )}
      {!sample && state.portfolioError && <p className="text-xs text-live">Couldn’t refresh from your brokerage: {state.portfolioError}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile icon={<DollarIcon />} label="Portfolio value" marker={sample ? sampleTag : sourceBadge(p.source)} value={money(p.total)}>
          {sample ? SAMPLE_LINE : p.sourceLabel}
        </StatTile>
        <StatTile icon={<WalletIcon />} label="Cash" marker={sampleTag} value={money(p.cash)}>
          {sample ? SAMPLE_LINE : total ? `${pct(p.cash / total, 0)} of your portfolio is not invested.` : "Money not invested in any stock."}
        </StatTile>
        <StatTile icon={<PieIcon />} label="Biggest position" marker={sampleTag} value={biggest ? biggest.ticker : "—"}>
          {sample ? (
            SAMPLE_LINE
          ) : biggest && total ? (
            <>
              {pct(biggest.value / total, 0)} of everything you own ({money(biggest.value, 0)}).{" "}
              {isResearchableStock(biggest.ticker, biggest.kind) ? (
                <a href={companyHref(biggest.ticker)} className={LINK}>
                  See {biggest.ticker}
                </a>
              ) : (
                <a href="#portfolio" className={LINK}>
                  See your holdings
                </a>
              )}
            </>
          ) : (
            "No stocks held yet."
          )}
        </StatTile>
        <StatTile
          icon={<ClockIcon />}
          label="Next morning check"
          marker={daily?.running ? <Badge variant="soft">Running now</Badge> : undefined}
          value={daily?.enabled && daily.nextRunAt ? friendlyTime(daily.nextRunAt) : "Off"}
        >
          {daily?.enabled ? `Last one: ${timeAgo(daily.lastRunAt)}.` : "Atlas only checks when you ask."}{" "}
          <a href="#watching" className={LINK}>
            Change
          </a>
        </StatTile>
      </div>
    </section>
  );
}
