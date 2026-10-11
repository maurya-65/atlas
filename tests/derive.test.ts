import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { companies, companyDetail, decidedDecisions, historyItems, pendingDecisions, sinceLastCheck } from "../src/components/derive";
import type { AppState } from "../src/components/format";
import type { ChatMessage } from "../src/lib/types";

// The pages are arranged from saved cards, so these checks pin down how cards are grouped and sorted.

const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;
const research = (id: string, ticker: string, day: number, stance = "hold_and_watch", score = 60, threadId?: string) =>
  ({ id, kind: "research", text: "", createdAt: at(day), threadId, research: { ticker, companyName: `${ticker} Corp`, stance, confidenceScore: score, generatedAt: at(day), via: "atlas" } }) as unknown as ChatMessage;
const card = (id: string, kind: ChatMessage["kind"], day: number, extra: Partial<ChatMessage> = {}) => ({ id, kind, text: "", createdAt: at(day), ...extra }) as ChatMessage;

const messages: ChatMessage[] = [
  research("r1", "MSFT", 1, "hold_and_watch", 55),
  research("r2", "TSLA", 2, "consider_selling", 40, "a-chat-thread"),
  research("r3", "MSFT", 3, "consider_buying", 70),
  card("d1", "constraint", 4, { title: "Buy more MSFT?", options: [{ label: "Buy $25 of MSFT", kind: "approve_trade", payload: { ticker: "MSFT", side: "BUY", dollars: 25 } }] }),
  card("d2", "constraint", 5, { resolved: "Dismiss" }),
  card("q1", "user", 6, { threadId: "a-chat-thread" }),
  card("a1", "agent", 6, { threadId: "a-chat-thread" }),
  card("t1", "thought", 7),
  card("x1", "receipt", 8),
  card("b1", "daily", 9, { daily: { flags: ["36% in cash"], researched: [{ ticker: "MSFT", stance: "hold_and_watch", confidenceScore: 62 }] } as ChatMessage["daily"] }),
];

const state = {
  messages,
  watchlist: ["TSLA"],
  rules: [{ id: "p1", kind: "price_below", ticker: "msft", text: "", action: "flag", createdAt: at(1) }],
  ruleStatus: [{ id: "c1", hits: ["Cash is high"] }],
  portfolio: { holdings: [{ ticker: "MSFT", name: "Microsoft", value: 4000 }] },
} as unknown as AppState;

test("companies are grouped by ticker, newest research first, wherever the research was started", () => {
  const list = companies(state);
  assert.deepEqual(list.map((c) => c.ticker), ["MSFT", "TSLA"]);
  assert.equal(list[0].latest.id, "r3");
  assert.equal(list[0].name, "Microsoft", "the broker's name wins over the research card's");
  assert.equal(list[1].watched, true);
});

test("a company's verdicts read oldest to newest", () => {
  const [msft] = companies(state);
  assert.deepEqual(msft.verdicts.map((v) => [v.stance, v.score]), [["hold_and_watch", 55], ["consider_buying", 70]]);
});

test("a company page collects its research, decisions and price rules", () => {
  const d = companyDetail(state, "msft");
  assert.deepEqual(d.research.map((m) => m.id), ["r3", "r1"]);
  assert.deepEqual(d.decisions.map((m) => m.id), ["d1"]);
  assert.equal(d.rules.length, 1);
  assert.equal(companyDetail(state, "NVDA").research.length, 0, "a company with no research still has a page");
});

test("decisions split into waiting and decided", () => {
  assert.deepEqual(pendingDecisions(messages).map((m) => m.id), ["d1"]);
  assert.deepEqual(decidedDecisions(messages).map((m) => m.id), ["d2"]);
});

test("history leaves chat questions and answers in Chat", () => {
  const ids = historyItems(messages).map((m) => m.id);
  assert.equal(ids.includes("q1") || ids.includes("a1"), false);
  assert.equal(ids[0], "b1");
  assert.deepEqual(historyItems(messages, "research").map((m) => m.id), ["r3", "r2", "r1"]);
  assert.deepEqual(historyItems(messages, "trades").map((m) => m.id), ["x1"]);
});

test("since the last check uses the newest brief, or the live rule check when there is none", () => {
  const withBrief = sinceLastCheck(state);
  assert.deepEqual(withBrief.flags, ["36% in cash"]);
  assert.equal(withBrief.researched[0].ticker, "MSFT");
  const without = sinceLastCheck({ ...state, messages: messages.filter((m) => m.kind !== "daily") });
  assert.equal(without.brief, null);
  assert.deepEqual(without.flags, ["Cash is high"]);
});
