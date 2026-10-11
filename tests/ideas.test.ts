import { setFetch, yahooPrice } from "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Budget, build, cleanText, simulateBuy, suggestAmounts, acceptIdea, previewIdea } from "../src/lib/ideas";
import { factsFromChart } from "../src/lib/market";
import { readStore, resetStore, updateStore, newMessage, addMessages } from "../src/lib/store";
import type { IdeaSession, IdeaSuggestion, Portfolio, Rule } from "../src/lib/types";

// The Ideas tab only suggests what checks out against real data, never shows a number the model wrote, and only
// ever places paper orders. These pin down those paths; the model calls themselves are not tested.

const DAY = 86_400;
function chart(patch: { meta?: Record<string, unknown>; days?: number; volume?: number } = {}) {
  const days = patch.days ?? 250;
  return {
    meta: { instrumentType: "ETF", fullExchangeName: "NYSEArca", longName: "Vanguard Dividend Fund", regularMarketPrice: 125, fiftyTwoWeekHigh: 130, ...patch.meta },
    timestamp: Array.from({ length: days }, (_, i) => 1_700_000_000 + i * DAY),
    indicators: { quote: [{ close: Array.from({ length: days }, (_, i) => 100 + i * 0.1), volume: Array.from({ length: days }, () => patch.volume ?? 1_000_000) }] },
    events: { dividends: { a: { amount: 1.2, date: Math.floor(Date.now() / 1000) - 30 * DAY } } },
  };
}

test("a real listed fund passes, with its numbers worked out from the prices", () => {
  const out = factsFromChart("VYM", chart());
  assert.ok("facts" in out);
  assert.equal(out.facts.kind, "fund");
  assert.equal(out.facts.yield, 1.2 / 125);
  assert.ok(out.facts.move1m! > 0 && out.facts.belowHigh > 0);
});

test("a ticker that doesn't exist, isn't US-listed, trades thinly or multiplies swings is set aside with a reason", () => {
  const why = (c: Parameters<typeof factsFromChart>[1]) => ("why" in factsFromChart("X", c) ? (factsFromChart("X", c) as { why: string }).why : "passed");
  assert.equal(why(null), "couldn't find it");
  assert.equal(why(chart({ meta: { instrumentType: "CRYPTOCURRENCY" } })), "not a US-listed stock or fund");
  assert.equal(why(chart({ meta: { fullExchangeName: "LSE" } })), "not a US-listed stock or fund");
  assert.equal(why(chart({ volume: 100 })), "too thinly traded");
  assert.equal(why(chart({ days: 40 })), "not enough price history");
  assert.match(why(chart({ meta: { longName: "ProShares UltraPro QQQ" } })), /too risky/);
  assert.equal(why(chart({ meta: { regularMarketPrice: 2 } })), "a very low-priced stock");
});

test("a sentence with a dollar, percent or multiple in the model's words is cut", () => {
  assert.equal(cleanText("It holds large steady companies. It returned 12% last year."), "It holds large steady companies.");
  assert.equal(cleanText("You would earn $500 a year."), null);
  assert.equal(cleanText("A broad fund that tracks the S&P 500."), "A broad fund that tracks the S&P 500.");
});

test("the spending limit adds up what calls used and refuses a call that could go past it", () => {
  const budget = new Budget(0.01);
  assert.ok(budget.allows(3000, 500));
  budget.track({ model: "claude-haiku-5-5", input_tokens: 10_000, output_tokens: 10_000 });
  assert.ok(Math.abs(budget.spent - 0.006) < 1e-9);
  assert.equal(budget.allows(3000, 10_000), false);
  assert.equal(new Budget(0.01).allows(3000, 100_000), false, "the worst case counts, not just the likely one");
});

const portfolio: Portfolio = {
  source: "paper",
  sourceLabel: "",
  accountId: null,
  accountName: null,
  brokerIsPaper: null,
  cash: 1000,
  total: 10_000,
  recentOrders: [],
  holdings: [{ ticker: "AAPL", name: "Apple", units: 40, price: 200, value: 8000, avgCost: 150, pnlPct: 0.33, kind: "stock" }],
};
const rules: Rule[] = [{ id: "c", kind: "concentration", threshold: 25, action: "flag", text: "", createdAt: "" }];

test("suggested amounts stay inside the paper cash and the share limits", () => {
  const items = [
    { ticker: "NEW", kind: "stock" as const },
    { ticker: "VOO", kind: "fund" as const },
    { ticker: "AAPL", kind: "stock" as const },
  ];
  // $5,000 shared three ways would be far over what paper cash and one-stock limits allow.
  const [stock, fund, held] = suggestAmounts(items, portfolio, 5000, 0.25);
  assert.equal(stock, 500, "a new stock is capped at 5% of the portfolio");
  assert.equal(fund, 500, "what's left of the paper cash");
  assert.equal(held, 0, "AAPL is already past the cap, so there is no room");
  assert.equal(suggestAmounts([items[0]], portfolio, null, 0.25)[0], 200, "no amount given: 2% of the portfolio");
});

test("a paper buy can't go past the cash or the user's one-stock limit", () => {
  const buy = { ticker: "AAPL", name: "Apple", kind: "stock" as const, price: 200 };
  assert.match(simulateBuy(portfolio, rules, { ...buy, ticker: "NEW", dollars: 1500 }).problems[0], /only have \$1000.00/);
  const heavy = simulateBuy(portfolio, rules, { ...buy, dollars: 100 });
  assert.match(heavy.problems[0], /81% of your portfolio, past your 25% limit/);
  const fine = simulateBuy(portfolio, rules, { ...buy, ticker: "NEW", dollars: 300 });
  assert.deepEqual(fine.problems, []);
  assert.ok(Math.abs(fine.cash.after - 0.07) < 1e-9 && Math.abs(fine.stock.after - 0.03) < 1e-9);
  // A fund is exempt from the one-stock limit, as in the concentration rule.
  assert.deepEqual(simulateBuy(portfolio, rules, { ...buy, ticker: "VOO", kind: "fund", dollars: 900 }).problems, []);
});

test("only ideas from the checked table whose explanation is clean are kept", () => {
  const kept = [{ facts: { ticker: "VYM", name: "Vanguard Dividend", kind: "fund" as const, price: 120, move1m: 0.02, move6m: 0.05, belowHigh: 0.03, swings: "calm" as const, yield: 0.03 }, c: { area: "broad market", angle: "" }, heldNow: 0, areaNow: 0 }];
  const words = { reason: "Steady payouts.", whatItIs: "A fund of dividend payers.", risk: "Payers can cut dividends.", wrongIf: "Dividends get cut.", fit: "" };
  const ideas = build(
    [
      { ticker: "vym", ...words },
      { ticker: "MADEUP", ...words },
      { ticker: "VYM", ...words },
    ],
    kept,
    portfolio,
    rules,
    null,
  );
  assert.deepEqual(ideas.map((i) => i.ticker), ["VYM"], "an invented ticker and a repeat are dropped");
  assert.equal(build([{ ticker: "VYM", ...words, risk: "It fell 40% in 2020." }], kept, portfolio, rules, null).length, 0, "a figure in a required part drops the idea");
});

const idea = (patch: Partial<IdeaSuggestion> = {}): IdeaSuggestion => ({
  ticker: "VYM",
  name: "Vanguard Dividend",
  kind: "fund",
  area: "broad market",
  reason: "r",
  whatItIs: "w",
  risk: "k",
  wrongIf: "x",
  fit: "",
  price: 100,
  move1m: 0.01,
  move6m: 0.02,
  belowHigh: 0.01,
  swings: "calm",
  yield: 0.03,
  dollars: 100,
  weightAfter: 0.02,
  areaNow: 0,
  heldNow: 0,
  ...patch,
});

async function saveSession(ideas: IdeaSuggestion[]) {
  const session: IdeaSession = { prompt: "p", status: "ready", questions: [], answers: [], ideas, dropped: [], summary: "s" };
  const [m] = await addMessages(newMessage({ kind: "ideas", text: "p", ideas: session }));
  return m.id;
}

beforeEach(async () => {
  await resetStore();
  setFetch(yahooPrice(100));
});

test("accepting an idea places a paper order, keeps it with the idea, and can't run twice", async () => {
  const id = await saveSession([idea()]);
  // Even in live mode an idea goes to the paper account.
  await updateStore((s) => {
    s.mode = "live";
  });
  const preview = await previewIdea(id, "VYM", 100);
  assert.deepEqual(preview.problems, []);

  const trade = await acceptIdea(id, "VYM", 100);
  assert.equal(trade.mode, "paper");
  const s = await readStore();
  assert.equal(s.trades.length, 1);
  assert.equal(s.paper!.cash, 1800 - 100);
  assert.equal(s.messages.find((m) => m.id === id)!.ideas!.ideas[0].trade!.id, trade.id);
  assert.equal(s.messages.filter((m) => m.kind === "receipt" && m.mode === "paper").length, 1);
  await assert.rejects(acceptIdea(id, "VYM", 100), /already in your paper account/);
});

test("an order that breaks the cash or one-stock limit is refused and nothing is bought", async () => {
  const id = await saveSession([idea({ ticker: "NVDA", kind: "stock" }), idea()]);
  await assert.rejects(acceptIdea(id, "VYM", 5000), /only have/);
  await assert.rejects(acceptIdea(id, "NVDA", 1700), /past your 25% limit/);
  assert.equal((await readStore()).trades.length, 0);
  await assert.rejects(acceptIdea(id, "TSLA", 50), /isn't on this page/);
});
