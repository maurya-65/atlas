import { randomUUID } from "crypto";
import { readStore, updateStore } from "./store";
import { priceFor, basePortfolio, ensurePaperBook } from "./portfolio";
import { placeRealOrder, realPortfolio } from "./snaptrade";
import type { TradeRecord } from "./types";

/**
 * Live-mode guardrails. A fixed dollar cap is the easiest limit for a first-time investor to reason about
 * ("never more than $25 at once"), and it keeps a mistake small. Enforced here on the server, not in the UI.
 */
export const LIVE_LIMITS = { perTrade: 25, perDay: 100 } as const;

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// One live order at a time, so two approvals at the same moment can't both fit under the same remaining allowance.
let liveQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = liveQueue.then(fn);
  liveQueue = run.catch(() => undefined);
  return run;
}

export async function liveSpentToday(): Promise<number> {
  const s = await readStore();
  return s.trades.filter((t) => t.mode === "live" && t.status !== "rejected" && isToday(t.createdAt)).reduce((sum, t) => sum + t.dollars, 0);
}

/**
 * Executes a trade the user has just approved. Never called by the agent on its own:
 * the only caller is the approval handler for a decision card the user clicked.
 */
export async function executeApprovedTrade(
  ticker: string,
  side: "BUY" | "SELL",
  dollars: number,
  opts: { forcePaper?: boolean } = {},
): Promise<TradeRecord> {
  ticker = ticker.toUpperCase().trim();
  if (!(dollars > 0) || !Number.isFinite(dollars)) throw new Error("Trade amount must be more than $0.");
  const s = await readStore();
  const price = await priceFor(ticker);

  if (s.mode === "paper" || opts.forcePaper) {
    // Daily-run suggestions are paper even in live mode: make sure the simulated book exists first.
    if (!s.paper) await ensurePaperBook(await basePortfolio());
    if (!price) throw new Error(`I couldn't get a price for ${ticker}, so I can't simulate this trade.`);
    const units = dollars / price;
    const record: TradeRecord = {
      id: randomUUID(),
      mode: "paper",
      ticker,
      side,
      dollars,
      units,
      price,
      status: "filled (simulated)",
      createdAt: new Date().toISOString(),
    };
    await updateStore((st) => {
      if (!st.paper) throw new Error("Paper portfolio isn't ready yet. Open the app once and try again.");
      const pos = st.paper.positions[ticker] ?? { units: 0, avgCost: price, name: ticker, lastPrice: price };
      if (side === "BUY") {
        if (st.paper.cash < dollars) throw new Error(`Not enough simulated cash: you have $${st.paper.cash.toFixed(2)}.`);
        pos.avgCost = (pos.avgCost * pos.units + dollars) / (pos.units + units);
        pos.units += units;
        st.paper.cash -= dollars;
      } else {
        if (pos.units * price < dollars - 0.01) throw new Error(`You only hold about $${(pos.units * price).toFixed(2)} of ${ticker} in paper mode.`);
        // Selling the whole position can overshoot by a rounding hair; never leave a negative holding.
        pos.units = Math.max(0, pos.units - units);
        st.paper.cash += dollars;
      }
      pos.lastPrice = price;
      st.paper.positions[ticker] = pos;
      st.trades.push(record);
    });
    return record;
  }

  // Live mode: real money through the user's own brokerage.
  return oneAtATime(() => placeLiveTrade(ticker, side, dollars, price));
}

async function placeLiveTrade(ticker: string, side: "BUY" | "SELL", dollars: number, price: number | null): Promise<TradeRecord> {
  if (process.env.VERCEL) throw new Error("Live mode only works when Atlas runs on your own computer.");
  if (dollars > LIVE_LIMITS.perTrade) {
    throw new Error(`Live trades are capped at $${LIVE_LIMITS.perTrade} each. Try $${LIVE_LIMITS.perTrade} or less.`);
  }
  const spent = await liveSpentToday();
  if (spent + dollars > LIVE_LIMITS.perDay) {
    throw new Error(`That would go past today's $${LIVE_LIMITS.perDay} live limit ($${spent.toFixed(2)} already used).`);
  }
  if (side === "SELL") {
    const real = await realPortfolio();
    const held = real?.holdings.find((h) => h.ticker === ticker);
    if (!held || held.value < dollars - 0.01) throw new Error(`You don't hold $${dollars} of ${ticker} in your real account.`);
  }

  const order = await placeRealOrder(ticker, side, dollars, price);
  const record: TradeRecord = {
    id: randomUUID(),
    mode: "live",
    ticker,
    side,
    dollars,
    units: price ? dollars / price : 0,
    price: price ?? 0,
    status: String(order.status ?? "submitted").toLowerCase(),
    brokerOrderId: order.brokerage_order_id,
    createdAt: new Date().toISOString(),
  };
  await updateStore((st) => {
    st.trades.push(record);
  });
  return record;
}
