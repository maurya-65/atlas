import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../src/lib/rules";
import type { Holding, Portfolio, Rule } from "../src/lib/types";

const holding = (ticker: string, value: number, pnlPct: number | null = 0, kind: string | null = null): Holding => ({
  ticker,
  name: ticker,
  units: value / 100,
  price: 100,
  value,
  avgCost: pnlPct == null ? null : 100 / (1 + pnlPct),
  pnlPct,
  kind,
});

function portfolio(holdings: Holding[], cash: number): Portfolio {
  return {
    source: "paper",
    sourceLabel: "test",
    accountId: null,
    accountName: null,
    brokerIsPaper: true,
    holdings,
    cash,
    total: cash + holdings.reduce((s, h) => s + h.value, 0),
    recentOrders: [],
  };
}

const rule = (r: Partial<Rule> & Pick<Rule, "kind">): Rule => ({ id: r.kind, text: `my ${r.kind} rule`, action: "flag", createdAt: "2026-01-01T00:00:00Z", ...r });

test("concentration flags only the stock above the limit", () => {
  const p = portfolio([holding("AAPL", 600), holding("MSFT", 200)], 200);
  const hits = evaluateRules(p, [rule({ kind: "concentration", threshold: 25 })]);
  assert.deepEqual(
    hits.map((h) => h.message.title),
    ["AAPL is 60.0% of your portfolio"],
  );
});

test("a fund is not one company: the concentration rule skips it", () => {
  const p = portfolio([holding("FXAIX", 600, 0, "mutualfund"), holding("QQQM", 300, 0, "etf"), holding("VFIAX", 50), holding("NVDA", 50, 0, "stock")], 0);
  assert.deepEqual(
    evaluateRules(p, [rule({ kind: "concentration", threshold: 4 })]).map((h) => h.message.title),
    ["NVDA is 5.0% of your portfolio"],
  );
});

test("every trade a rule suggests is $25, inside the live per-trade cap", () => {
  const p = portfolio([holding("AAPL", 600, -0.3)], 400);
  const rules = [rule({ kind: "concentration", threshold: 25, action: "propose" }), rule({ kind: "drawdown", threshold: 10, action: "propose" })];
  const trades = evaluateRules(p, rules)
    .flatMap((h) => h.message.options ?? [])
    .filter((o) => o.kind === "approve_trade");
  assert.ok(trades.length >= 2);
  for (const t of trades) assert.equal(t.payload?.dollars, 25);
});

test("drawdown needs a known purchase price and a big enough drop", () => {
  const p = portfolio([holding("DOWN", 100, -0.12), holding("FLAT", 100, -0.05), holding("UNKNOWN", 100, null)], 0);
  assert.deepEqual(
    evaluateRules(p, [rule({ kind: "drawdown", threshold: 10 })]).map((h) => h.message.title),
    ["DOWN is down 12.0% from what you paid"],
  );
});

test("funds and crypto never get a Research button", () => {
  const p = portfolio([holding("BTC", 700, -0.4), holding("ARKK", 300, -0.4, "etf")], 0);
  const options = evaluateRules(p, [rule({ kind: "concentration", threshold: 25 }), rule({ kind: "drawdown", threshold: 10 })]).flatMap(
    (h) => h.message.options ?? [],
  );
  assert.ok(options.length > 0);
  assert.equal(options.filter((o) => o.kind === "research").length, 0);
});

test("an empty portfolio trips nothing", () => {
  const all: Rule[] = [rule({ kind: "concentration", threshold: 25 }), rule({ kind: "drawdown", threshold: 10 }), rule({ kind: "idle_cash", threshold: 10 })];
  assert.deepEqual(evaluateRules(portfolio([], 0), all), []);
});
