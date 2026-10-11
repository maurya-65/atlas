import { updateStore } from "./store";
import type { PaperBook, TradeRecord } from "./types";

export interface PaperPosition {
  ticker: string;
  name: string;
  units: number;
  avgCost: number;
  price: number;
  value: number;
}

export interface PaperAccount {
  cash: number;
  seededFrom: PaperBook["seededFrom"];
  seededAt: string;
  positions: PaperPosition[];
  totalValue: number;
}

export interface TradeEffect {
  id: string;
  ticker: string;
  side: TradeRecord["side"];
  dollars: number;
  priceThen: number;
  priceNow: number;
  /** Dollars gained (positive) or lost (negative) compared with not having made the trade */
  effect: number;
  effectPct: number;
  createdAt: string;
}

export interface PaperPerformance {
  trades: TradeEffect[];
  total: number;
  best: TradeEffect | null;
  worst: TradeEffect | null;
}

/** The paper book as the page shows it: positions at today's prices, biggest first. */
export function paperAccount(book: PaperBook, prices: Record<string, number>): PaperAccount {
  const positions = Object.entries(book.positions)
    .filter(([, p]) => p.units > 1e-9)
    .map(([ticker, p]) => {
      const price = prices[ticker] ?? p.lastPrice;
      return { ticker, name: p.name, units: p.units, avgCost: p.avgCost, price, value: p.units * price };
    })
    .sort((a, b) => b.value - a.value);
  return {
    cash: book.cash,
    seededFrom: book.seededFrom,
    seededAt: book.seededAt,
    positions,
    totalValue: book.cash + positions.reduce((sum, p) => sum + p.value, 0),
  };
}

/**
 * What each approved paper trade did, against not having made it: a buy gains if the shares are worth more
 * now than was paid, a sell gains if the shares are worth less now than was received. A ticker with no
 * current price counts as unchanged.
 */
export function paperPerformance(trades: TradeRecord[], prices: Record<string, number>): PaperPerformance {
  const effects = trades
    .filter((t) => t.mode === "paper")
    .map((t): TradeEffect => {
      const priceNow = prices[t.ticker] ?? t.price;
      const worthNow = t.units * priceNow;
      const effect = t.side === "BUY" ? worthNow - t.dollars : t.dollars - worthNow;
      return {
        id: t.id,
        ticker: t.ticker,
        side: t.side,
        dollars: t.dollars,
        priceThen: t.price,
        priceNow,
        effect,
        effectPct: t.dollars > 0 ? effect / t.dollars : 0,
        createdAt: t.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byEffect = [...effects].sort((a, b) => b.effect - a.effect);
  return {
    trades: effects,
    total: effects.reduce((sum, t) => sum + t.effect, 0),
    best: byEffect[0] ?? null,
    worst: byEffect.length > 1 ? byEffect[byEffect.length - 1] : null,
  };
}

/**
 * Clears the paper book and the paper trades. The book is seeded again from the connected account the next
 * time it is read. Real trades are not touched.
 */
export async function resetPaperAccount(): Promise<void> {
  await updateStore((s) => {
    s.paper = null;
    s.trades = s.trades.filter((t) => t.mode !== "paper");
  });
}
