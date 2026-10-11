import { post, setFetch, yahooPrice } from "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/paper/route";
import { paperAccount, paperPerformance } from "../src/lib/paper";
import { ensurePaperBook } from "../src/lib/portfolio";
import { readStore, resetStore, updateStore } from "../src/lib/store";
import type { PaperBook, TradeRecord } from "../src/lib/types";

const trade = (patch: Partial<TradeRecord>): TradeRecord => ({
  id: "t1",
  mode: "paper",
  ticker: "AAPL",
  side: "BUY",
  dollars: 100,
  units: 1,
  price: 100,
  status: "filled (simulated)",
  createdAt: "2026-10-01T12:00:00.000Z",
  ...patch,
});

beforeEach(async () => {
  await resetStore();
  setFetch(yahooPrice(100));
});

test("a buy gains when the shares are worth more now, a sell gains when they are worth less", () => {
  const prices = { AAPL: 120, TSLA: 80 };
  const { trades, total } = paperPerformance(
    [trade({ id: "buy" }), trade({ id: "sell", ticker: "TSLA", side: "SELL", dollars: 100, units: 1, price: 100 })],
    prices,
  );
  const effect = (id: string) => trades.find((t) => t.id === id)!;
  assert.equal(effect("buy").effect, 20);
  assert.equal(effect("buy").effectPct, 0.2);
  assert.equal(effect("sell").effect, 20, "sold at 100, now worth 80: 20 better than holding");
  assert.equal(total, 40);
});

test("a ticker with no current price counts as unchanged, and live trades are ignored", () => {
  const { trades, total } = paperPerformance([trade({}), trade({ id: "real", mode: "live", dollars: 25, units: 0.25 })], {});
  assert.equal(trades.length, 1);
  assert.equal(trades[0].effect, 0);
  assert.equal(total, 0);
});

test("best and worst are the biggest gain and the biggest loss, and a single trade has no worst", () => {
  const prices = { AAPL: 120, TSLA: 50 };
  const two = paperPerformance([trade({ id: "up" }), trade({ id: "down", ticker: "TSLA", dollars: 100, units: 1, price: 100 })], prices);
  assert.equal(two.best?.id, "up");
  assert.equal(two.worst?.id, "down");
  assert.equal(paperPerformance([trade({})], prices).worst, null);
  assert.equal(paperPerformance([], prices).best, null);
});

test("the paper account values positions at today's prices and leaves out empty ones", () => {
  const book: PaperBook = {
    cash: 50,
    seededFrom: "demo",
    seededAt: "2026-10-01T00:00:00.000Z",
    positions: {
      AAPL: { units: 2, avgCost: 90, name: "Apple", lastPrice: 100 },
      GONE: { units: 0, avgCost: 10, name: "Sold out", lastPrice: 10 },
    },
  };
  const account = paperAccount(book, { AAPL: 110 });
  assert.deepEqual(account.positions.map((p) => p.ticker), ["AAPL"]);
  assert.equal(account.positions[0].value, 220);
  assert.equal(account.totalValue, 270);
});

test("resetting clears the paper book and paper trades but keeps real trades", async () => {
  await ensurePaperBook({
    source: "snaptrade",
    sourceLabel: "",
    accountId: "a",
    accountName: "Individual",
    brokerIsPaper: true,
    cash: 500,
    total: 500,
    recentOrders: [],
    holdings: [],
  });
  await updateStore((s) => {
    s.trades = [trade({}), trade({ id: "real", mode: "live" })];
  });
  const res = await POST(post("/api/paper", { action: "reset" }));
  assert.equal(res.status, 200);
  const s = await readStore();
  assert.equal(s.paper, null);
  assert.deepEqual(s.trades.map((t) => t.id), ["real"]);
});

test("the paper route lists the trades newest first and refuses unknown actions", async () => {
  await updateStore((s) => {
    s.trades = [trade({ id: "old" }), trade({ id: "new", createdAt: "2026-10-05T12:00:00.000Z" })];
  });
  const body = (await (await GET()).json()) as { trades: TradeRecord[]; performance: { trades: unknown[] }; book: unknown };
  assert.deepEqual(body.trades.map((t) => t.id), ["new", "old"]);
  assert.equal(body.performance.trades.length, 2);
  assert.ok(body.book, "reading the account seeds the paper book");
  assert.equal((await POST(post("/api/paper", { action: "burn" }))).status, 400);
});
