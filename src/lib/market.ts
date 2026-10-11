// What the Ideas tab checks about a ticker before it may be suggested: it exists, it is a US-listed stock or
// fund, it trades enough, and how its price has moved. Public delayed data from Yahoo's chart endpoint; all the
// numbers are worked out here, never by a model.

export interface MarketFacts {
  ticker: string;
  name: string;
  kind: "stock" | "fund";
  price: number;
  /** Fractions: 0.05 = up 5% */
  move1m: number | null;
  move6m: number | null;
  /** How far below the highest price of the year (0.1 = 10% below) */
  belowHigh: number;
  swings: "calm" | "moderate" | "bumpy";
  /** Dividends paid over the last year as a share of the price, null when it pays none */
  yield: number | null;
}

const MIN_PRICE = 5;
const MIN_DAYS = 120;
/** Average dollars traded per day over the last three months. Below this a stock is too thin to buy and sell easily. */
const MIN_DOLLAR_VOLUME = 2_000_000;
const US_EXCHANGE = /nasdaq|nyse|bats|cboe|amex/i;
const LEVERAGED = /\b(2x|3x|ultra|ultrapro|leveraged|inverse|bull|bear)\b/i;

interface Chart {
  meta?: {
    symbol?: string;
    instrumentType?: string;
    fullExchangeName?: string;
    longName?: string;
    shortName?: string;
    regularMarketPrice?: number;
    fiftyTwoWeekHigh?: number;
  };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
  events?: { dividends?: Record<string, { amount: number; date: number }> };
}

const tail = <T>(list: T[], n: number) => list.slice(Math.max(0, list.length - n));

function stdev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/** Turns one year of daily prices into the facts, or the plain reason the ticker can't be suggested. */
export function factsFromChart(ticker: string, chart: Chart | null | undefined): { facts: MarketFacts } | { why: string } {
  const meta = chart?.meta;
  const price = meta?.regularMarketPrice;
  if (!meta || typeof price !== "number" || !(price > 0)) return { why: "couldn't find it" };
  const type = meta.instrumentType;
  if ((type !== "EQUITY" && type !== "ETF") || !US_EXCHANGE.test(meta.fullExchangeName ?? "")) return { why: "not a US-listed stock or fund" };
  const name = meta.longName || meta.shortName || ticker;
  if (type === "ETF" && LEVERAGED.test(name)) return { why: "too risky for most people (it multiplies swings)" };
  if (price < MIN_PRICE) return { why: "a very low-priced stock" };

  const quote = chart.indicators?.quote?.[0];
  const closes: number[] = [];
  const dollars: number[] = [];
  (chart.timestamp ?? []).forEach((_, i) => {
    const close = quote?.close?.[i];
    if (typeof close !== "number" || !(close > 0)) return;
    closes.push(close);
    const volume = quote?.volume?.[i];
    if (typeof volume === "number") dollars.push(volume * close);
  });
  if (closes.length < MIN_DAYS) return { why: "not enough price history" };
  const recent = tail(dollars, 63);
  if (recent.length < 20 || recent.reduce((a, b) => a + b, 0) / recent.length < MIN_DOLLAR_VOLUME) return { why: "too thinly traded" };

  const daysAgo = (n: number) => (closes.length > n ? price / closes[closes.length - 1 - n] - 1 : null);
  const lastSixMonths = tail(closes, 121);
  const returns = lastSixMonths.slice(1).map((c, i) => Math.log(c / lastSixMonths[i]));
  const yearly = stdev(returns) * Math.sqrt(252);
  const high = Math.max(meta.fiftyTwoWeekHigh ?? 0, ...closes);
  const paid = Object.values(chart.events?.dividends ?? {})
    .filter((d) => d.date * 1000 > Date.now() - 365 * 86_400_000)
    .reduce((sum, d) => sum + d.amount, 0);

  return {
    facts: {
      ticker,
      name,
      kind: type === "ETF" ? "fund" : "stock",
      price,
      move1m: daysAgo(21),
      move6m: daysAgo(126),
      belowHigh: Math.max(0, 1 - price / high),
      swings: yearly < 0.2 ? "calm" : yearly < 0.35 ? "moderate" : "bumpy",
      yield: paid > 0 ? paid / price : null,
    },
  };
}

/**
 * Looks a ticker up. Resolves to the reason when the ticker can't be suggested; throws when the data
 * source itself couldn't be reached, so a broken connection isn't mistaken for a bad ticker.
 */
export async function marketFacts(ticker: string): Promise<{ facts: MarketFacts } | { why: string }> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d&events=div`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return { why: "couldn't find it" };
  if (!res.ok) throw new Error(`Market data is not available right now (status ${res.status}).`);
  const json = (await res.json()) as { chart?: { result?: Chart[] | null } };
  return factsFromChart(ticker, json.chart?.result?.[0]);
}

/** Today's price of a US-listed ticker, or null when there isn't one. */
export async function latestPrice(ticker: string): Promise<number | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const price = ((await res.json()) as { chart?: { result?: Chart[] | null } }).chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" && price > 0 ? price : null;
}
