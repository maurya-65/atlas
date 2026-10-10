import { readStore, updateStore } from "./store";
import { realPortfolio, snaptradeConfigured, snaptradeErrorText, quote } from "./snaptrade";
import type { Holding, PaperBook, Portfolio } from "./types";

// Only used when SnapTrade keys are missing, so the UI can be developed offline.
// Always labelled as demo data in the UI; never mixed with real account data.
const DEMO: Portfolio = {
  source: "demo",
  sourceLabel: "Demo portfolio (SnapTrade isn't configured, so these numbers are made up)",
  accountId: null,
  accountName: "Demo account",
  brokerIsPaper: true,
  cash: 1800,
  total: 0,
  recentOrders: [],
  holdings: [
    h("NVDA", "NVIDIA Corp", 20, 181.2, 120.5),
    h("AAPL", "Apple Inc", 15, 228.4, 190.1),
    h("TSLA", "Tesla Inc", 6, 236.9, 281.0),
    h("BA", "Boeing Co", 4, 171.3, 214.6),
  ],
};
DEMO.total = DEMO.cash + DEMO.holdings.reduce((s, x) => s + x.value, 0);

function h(ticker: string, name: string, units: number, price: number, avgCost: number): Holding {
  return { ticker, name, units, price, value: units * price, avgCost, pnlPct: price / avgCost - 1 };
}

/** Public delayed quote, used only for demo/paper pricing when no brokerage quote is available. */
const publicCache = new Map<string, { price: number; at: number }>();
async function publicQuote(ticker: string): Promise<number | null> {
  const hit = publicCache.get(ticker);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.price;
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price !== "number") return null;
    publicCache.set(ticker, { price, at: Date.now() });
    return price;
  } catch {
    return null;
  }
}

async function demoPortfolio(label?: string): Promise<Portfolio> {
  const holdings = await Promise.all(
    DEMO.holdings.map(async (x) => {
      const price = (await publicQuote(x.ticker)) ?? x.price;
      return h(x.ticker, x.name, x.units, price, x.avgCost!);
    }),
  );
  const total = DEMO.cash + holdings.reduce((s, x) => s + x.value, 0);
  return { ...DEMO, holdings, total, sourceLabel: label ?? DEMO.sourceLabel };
}

/** The last reason the brokerage couldn't be read (null when the last read worked). Shown by /api/state. */
let lastBaseError: string | null = null;
export function portfolioReadError(): string | null {
  return lastBaseError;
}
/** True when basePortfolio fell back to demo data because SnapTrade threw. */
let baseIsFallback = false;

export async function basePortfolio(): Promise<Portfolio> {
  if (!snaptradeConfigured) return demoPortfolio();
  try {
    const real = await realPortfolio();
    lastBaseError = null;
    baseIsFallback = false;
    return real ?? demoPortfolio("No brokerage connected yet. Showing a made-up demo portfolio until you connect one.");
  } catch (e) {
    lastBaseError = snaptradeErrorText(e);
    baseIsFallback = true;
    return demoPortfolio("Sample data only: Atlas couldn't read your brokerage right now, so these numbers are made up.");
  }
}

/** Paper book starts as a copy of the user's real holdings, so simulated trades feel like their own account. */
export async function ensurePaperBook(base: Portfolio): Promise<PaperBook> {
  const s = await readStore();
  const seededFrom = base.source === "snaptrade" ? "snaptrade" : "demo";
  // Re-seed once a real account connects, replacing a demo-seeded book.
  if (s.paper && !(s.paper.seededFrom === "demo" && seededFrom === "snaptrade")) return s.paper;
  const book: PaperBook = {
    cash: base.cash,
    positions: Object.fromEntries(
      base.holdings.map((x) => [x.ticker, { units: x.units, avgCost: x.avgCost ?? x.price, name: x.name, lastPrice: x.price }]),
    ),
    seededFrom,
    seededAt: new Date().toISOString(),
  };
  await updateStore((st) => {
    st.paper = book;
  });
  return book;
}

function fromBook(book: PaperBook, base: Portfolio): Portfolio {
  const livePrices = new Map(base.holdings.map((x) => [x.ticker, x.price]));
  const holdings = Object.entries(book.positions)
    .filter(([, p]) => p.units > 1e-9)
    .map(([ticker, p]) => {
      const price = livePrices.get(ticker) ?? p.lastPrice;
      return { ticker, name: p.name, units: p.units, price, value: p.units * price, avgCost: p.avgCost, pnlPct: price / p.avgCost - 1 };
    });
  return {
    ...base,
    source: "paper",
    sourceLabel:
      base.source === "snaptrade"
        ? "Paper copy of your brokerage account. Live prices, simulated trades."
        : "Paper copy of the demo portfolio. Simulated trades.",
    holdings,
    cash: book.cash,
    total: book.cash + holdings.reduce((s, x) => s + x.value, 0),
  };
}

/** What the agent and rules look at: the simulated book in paper mode, the real account in live mode. */
export async function activePortfolio(): Promise<Portfolio> {
  const s = await readStore();
  const base = await basePortfolio();
  if (s.mode === "live") return base;
  if (baseIsFallback && s.paper && s.paper.seededFrom === "snaptrade") {
    // Brokerage unreadable: show the existing paper book at its last known prices, not demo prices.
    const p = fromBook(s.paper, { ...base, holdings: [] });
    return { ...p, sourceLabel: "Simulated copy of your real account (paper mode), at last known prices. The brokerage couldn't be read just now." };
  }
  return fromBook(await ensurePaperBook(base), base);
}

/** Best available price for a ticker: SnapTrade quote, then holdings, then the paper book. */
export async function priceFor(ticker: string): Promise<number | null> {
  const q = await quote(ticker);
  if (q) return q;
  const base = await basePortfolio();
  const held = base.holdings.find((x) => x.ticker === ticker);
  if (held) return held.price;
  const pub = await publicQuote(ticker);
  if (pub) return pub;
  const s = await readStore();
  return s.paper?.positions[ticker]?.lastPrice ?? null;
}
