import { setFetch, yahooPrice } from "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_LIMITS, executeApprovedTrade, liveSpentToday } from "../src/lib/trading";
import { ensurePaperBook } from "../src/lib/portfolio";
import { readStore, resetStore, updateStore } from "../src/lib/store";
import type { Portfolio, TradeRecord } from "../src/lib/types";

// What SnapTrade hands Atlas: two positions and some cash.
const broker: Portfolio = {
  source: "snaptrade",
  sourceLabel: "Live data from Sandbox via SnapTrade",
  accountId: "acct-1",
  accountName: "Individual",
  brokerIsPaper: true,
  cash: 1000,
  total: 5000,
  recentOrders: [],
  holdings: [
    { ticker: "AAPL", name: "Apple Inc", units: 10, price: 200, value: 2000, avgCost: 150, pnlPct: 200 / 150 - 1 },
    { ticker: "MSFT", name: "Microsoft Corp", units: 5, price: 400, value: 2000, avgCost: null, pnlPct: null },
  ],
};

beforeEach(async () => {
  await resetStore();
  setFetch(yahooPrice(100));
});

test("the paper book starts as a copy of the brokerage account", async () => {
  const book = await ensurePaperBook(broker);
  assert.equal(book.seededFrom, "snaptrade");
  assert.equal(book.cash, 1000);
  assert.deepEqual(book.positions.AAPL, { units: 10, avgCost: 150, name: "Apple Inc", lastPrice: 200 });
  // No cost basis from the broker: today's price stands in for it.
  assert.equal(book.positions.MSFT.avgCost, 400);
});

test("a later read of the brokerage doesn't throw away simulated trades", async () => {
  await ensurePaperBook(broker);
  await updateStore((s) => {
    s.paper!.cash = 123;
  });
  assert.equal((await ensurePaperBook({ ...broker, cash: 9999 })).cash, 123);
});

test("a paper buy moves cash into shares", async () => {
  await ensurePaperBook(broker);
  const t = await executeApprovedTrade("aapl", "BUY", 50);
  assert.equal(t.mode, "paper");
  assert.equal(t.units, 0.5);
  const s = await readStore();
  assert.equal(s.paper!.cash, 950);
  assert.equal(s.paper!.positions.AAPL.units, 10.5);
  assert.equal(s.trades.length, 1);
});

test("paper trades can't spend cash or sell shares that aren't there", async () => {
  await ensurePaperBook(broker);
  await assert.rejects(executeApprovedTrade("AAPL", "BUY", 1001), /Not enough simulated cash/);
  await assert.rejects(executeApprovedTrade("AAPL", "SELL", 1001), /You only hold about \$1000\.00 of AAPL/);
  await assert.rejects(executeApprovedTrade("AAPL", "BUY", 0), /more than \$0/);
  await assert.rejects(executeApprovedTrade("AAPL", "BUY", Number.NaN), /more than \$0/);
  assert.equal((await readStore()).trades.length, 0);
});

test("selling a whole paper position leaves zero shares, not a negative amount", async () => {
  await ensurePaperBook(broker);
  // 10 shares at $100; the check allows a one-cent rounding overshoot.
  await executeApprovedTrade("AAPL", "SELL", 1000.005);
  assert.equal((await readStore()).paper!.positions.AAPL.units, 0);
});

const liveTrade = (dollars: number, createdAt = new Date().toISOString(), status = "accepted"): TradeRecord => ({
  id: `t-${dollars}-${createdAt}`,
  mode: "live",
  ticker: "AAPL",
  side: "BUY",
  dollars,
  units: 1,
  price: 100,
  status,
  createdAt,
});

async function goLive(trades: TradeRecord[] = []) {
  await updateStore((s) => {
    s.mode = "live";
    s.trades = trades;
  });
}

test("live mode refuses anything over the per-trade cap", async () => {
  await goLive();
  await assert.rejects(executeApprovedTrade("AAPL", "BUY", LIVE_LIMITS.perTrade + 0.01), /capped at \$25 each/);
  assert.equal((await readStore()).trades.length, 0);
});

test("live mode refuses a trade that would pass the daily cap", async () => {
  await goLive([liveTrade(25), liveTrade(25), liveTrade(25), liveTrade(15)]);
  await assert.rejects(executeApprovedTrade("AAPL", "BUY", 15), /past today's \$100 live limit \(\$90\.00 already used\)/);
});

test("the daily cap counts today's accepted live orders only", async () => {
  const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();
  await goLive([liveTrade(25, yesterday), liveTrade(25, undefined, "rejected"), { ...liveTrade(40), mode: "paper" }, liveTrade(10)]);
  assert.equal(await liveSpentToday(), 10);
});

test("a live sell needs the shares to be in the real account", async () => {
  await goLive();
  // No brokerage is connected in tests, so nothing is held for real.
  await assert.rejects(executeApprovedTrade("AAPL", "SELL", 10), /don't hold \$10 of AAPL in your real account/);
});

test("a live order that can't be placed records no trade", async () => {
  await goLive();
  await assert.rejects(executeApprovedTrade("AAPL", "BUY", 10), /No brokerage account found/);
  assert.equal((await readStore()).trades.length, 0);
});

test("a paper-only suggestion stays simulated in live mode", async () => {
  await ensurePaperBook(broker);
  await goLive();
  const t = await executeApprovedTrade("AAPL", "BUY", 400, { forcePaper: true });
  assert.equal(t.mode, "paper");
  assert.equal(await liveSpentToday(), 0);
});
