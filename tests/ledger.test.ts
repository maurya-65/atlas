import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ledger } from "../src/components/ledger";
import type { CardOption, ChatMessage } from "../src/lib/types";

const at = (hour: number) => `2026-10-10T${String(hour).padStart(2, "0")}:00:00.000Z`;
const card = (id: string, hour: number, option: CardOption): ChatMessage =>
  ({ id, kind: "constraint", text: "", title: id, createdAt: at(hour), options: [option], resolved: option.label }) as ChatMessage;
const receipt = (id: string, hour: number, text: string, mode: "paper" | "live" = "paper"): ChatMessage => ({ id, kind: "receipt", text, mode, createdAt: at(hour) }) as ChatMessage;
const buy = (ticker: string): CardOption => ({ label: `Buy $20 of ${ticker}`, kind: "approve_trade", payload: { ticker, side: "BUY", dollars: 20 } });

test("a trade card is paired with the first receipt for its ticker after it, and each receipt is used once", () => {
  const entries = ledger(
    [card("c1", 1, buy("AAPL")), card("c2", 3, buy("AAPL"))],
    [receipt("r-early", 0, "Bought $5.00 of AAPL"), receipt("r1", 2, "Bought $20.00 of AAPL"), receipt("r2", 4, "Bought $20.00 of AAPL")],
  );
  const byCard = Object.fromEntries(entries.filter((e) => e.kind === "decision").map((e) => [e.message.id, e.at]));
  assert.equal(byCard.c1, at(2));
  assert.equal(byCard.c2, at(4));
  const alone = entries.filter((e) => e.kind === "trade");
  assert.deepEqual(alone.map((e) => e.message.id), ["r-early"], "a receipt before any card stands on its own");
});

test("outcomes point to where the result lives", () => {
  const entries = ledger(
    [
      card("trade", 1, buy("MSFT")),
      card("live", 3, buy("TSLA")),
      card("look", 5, { label: "Research MSFT", kind: "research", payload: { ticker: "MSFT" } }),
      card("no", 6, { label: "Not now", kind: "dismiss" }),
    ],
    [receipt("r1", 2, "Bought $20.00 of MSFT"), receipt("r2", 4, "Sent a real order: BUY $20.00 of TSLA", "live")],
  );
  const hrefs = Object.fromEntries(entries.filter((e) => e.kind === "decision").map((e) => [e.message.id, e.outcome.href]));
  assert.deepEqual(hrefs, { trade: "#portfolio/paper", live: "#portfolio/orders", look: "#research/MSFT", no: undefined });
});

test("an approved trade with no receipt does not invent a link", () => {
  const entries = ledger([card("c", 1, buy("NVDA"))], [receipt("r", 2, "Bought $20.00 of AAPL")]);
  const decision = entries.find((e) => e.kind === "decision");
  assert.equal(decision?.kind === "decision" && decision.outcome.href, undefined);
  assert.equal(entries.some((e) => e.kind === "trade"), true, "the unrelated receipt is still listed");
});

test("entries are newest first", () => {
  const entries = ledger([card("old", 1, { label: "Not now", kind: "dismiss" }), card("new", 5, { label: "Not now", kind: "dismiss" })], []);
  assert.deepEqual(entries.map((e) => e.message.id), ["new", "old"]);
});
