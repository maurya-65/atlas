import type { ChatMessage, DailyBrief, DailyState, Portfolio } from "@/lib/types";

/**
 * Made-up example content for empty states, so a new user sees what the page will look like.
 * Everything here is shown under a visible "Sample" tag and is display-only: it is never mixed into
 * real numbers and never passed to an action (research, trade, review).
 */

const HOLDINGS: { ticker: string; name: string; units: number; price: number; avgCost: number }[] = [
  { ticker: "AAPL", name: "Apple Inc.", units: 42, price: 228.4, avgCost: 187.2 },
  { ticker: "MSFT", name: "Microsoft Corporation", units: 18, price: 431.75, avgCost: 372.1 },
  { ticker: "NVDA", name: "NVIDIA Corporation", units: 55, price: 132.6, avgCost: 96.4 },
  { ticker: "GOOGL", name: "Alphabet Inc.", units: 30, price: 171.9, avgCost: 148.25 },
  { ticker: "COST", name: "Costco Wholesale Corporation", units: 5, price: 912.3, avgCost: 845.0 },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", units: 16, price: 219.8, avgCost: 226.9 },
];

const CASH = 3180.5;

export const SAMPLE_PORTFOLIO: Portfolio = (() => {
  const holdings = HOLDINGS.map((h) => ({
    ticker: h.ticker,
    name: h.name,
    units: h.units,
    price: h.price,
    value: Math.round(h.units * h.price * 100) / 100,
    avgCost: h.avgCost,
    pnlPct: h.price / h.avgCost - 1,
  }));
  const total = Math.round((holdings.reduce((sum, h) => sum + h.value, 0) + CASH) * 100) / 100;
  return {
    source: "demo",
    sourceLabel: "Sample portfolio with made-up numbers.",
    accountId: null,
    accountName: null,
    brokerIsPaper: null,
    holdings,
    cash: CASH,
    total,
    recentOrders: [],
  };
})();

/** Sample watch list: the sample holdings, biggest first, with made-up "last researched" times. */
export function sampleWatch(now = Date.now()): DailyState["watch"] {
  const ago = [null, 1, 2, 3, 5, 6];
  return [...SAMPLE_PORTFOLIO.holdings]
    .sort((a, b) => b.value - a.value)
    .map((h, i) => ({
      ticker: h.ticker,
      name: h.name,
      weight: h.value / SAMPLE_PORTFOLIO.total,
      lastResearchedAt: ago[i] === null ? null : new Date(now - (ago[i] as number) * 86400000).toISOString(),
    }));
}

const BIGGEST = [...SAMPLE_PORTFOLIO.holdings].sort((a, b) => b.value - a.value)[0];
const share = (n: number) => `${Math.round((n / SAMPLE_PORTFOLIO.total) * 100)}%`;

export const SAMPLE_FLAGS = [
  `${BIGGEST.ticker} is ${share(BIGGEST.value)} of the portfolio, above a 20% single-stock limit.`,
  `Cash is ${share(SAMPLE_PORTFOLIO.cash)} of the portfolio, above a 5% idle-cash limit.`,
];

/** Sample daily brief and the message that carries it. */
export function sampleBrief(now = Date.now()): { m: ChatMessage; b: DailyBrief } {
  const d = new Date(now);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const total = SAMPLE_PORTFOLIO.total;
  const moves: Record<string, number> = { NVDA: 0.031, AAPL: 0.008, MSFT: -0.004, GOOGL: 0.012, COST: -0.006, JPM: -0.014 };
  const b: DailyBrief = {
    day,
    trigger: "schedule",
    portfolio: {
      total,
      cash: SAMPLE_PORTFOLIO.cash,
      source: "demo",
      changeDollars: 412,
      changePct: 412 / (total - 412),
      since: new Date(now - 86400000).toISOString(),
    },
    movers: SAMPLE_PORTFOLIO.holdings
      .map((h) => ({ ticker: h.ticker, name: h.name, value: h.value, weight: h.value / total, changePct: moves[h.ticker] ?? 0 }))
      .sort((a, c) => Math.abs(c.changePct) - Math.abs(a.changePct)),
    flags: SAMPLE_FLAGS,
    researched: [{ ticker: BIGGEST.ticker, stance: "hold_and_watch", confidenceScore: 68 }],
    summary:
      `A quiet day overall. Chip stocks led after strong data-centre orders, which lifted NVDA. Banks slipped on rate worries, so JPM gave back some ground. Nothing here needs a trade today; the one thing to keep an eye on is how concentrated the portfolio is in ${BIGGEST.ticker}.`,
    recommendations: 0,
    nextRunAt: null,
  };
  const m: ChatMessage = { id: "sample-brief", kind: "daily", text: b.summary, createdAt: new Date(now).toISOString(), daily: b };
  return { m, b };
}
