import { post, setFetch, yahooPrice } from "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST as action } from "../src/app/api/action/route";
import { POST as mode } from "../src/app/api/mode/route";
import { GET as cron } from "../src/app/api/cron/daily/route";
import { POST as login } from "../src/app/api/login/route";
import { sessionToken } from "../src/lib/auth";
import { addMessages, newMessage, readStore, resetStore, updateStore } from "../src/lib/store";
import type { CardOption, ChatMessage } from "../src/lib/types";

beforeEach(async () => {
  await resetStore();
  setFetch(yahooPrice(100));
  delete process.env.ATLAS_PASSWORD;
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL;
});

const body = async (res: Response) => (await res.json()) as Record<string, unknown>;

async function card(options: CardOption[]): Promise<ChatMessage> {
  const [m] = await addMessages(newMessage({ kind: "constraint", title: "A decision", text: "Why it matters.", options }));
  return m;
}
const buy = (dollars: number, extra: Partial<CardOption["payload"]> = {}): CardOption => ({
  label: `Buy $${dollars} of AAPL`,
  kind: "approve_trade",
  payload: { ticker: "AAPL", side: "BUY", dollars, ...extra },
});
const click = (m: ChatMessage, optionIndex: unknown = 0) => action(post("/api/action", { messageId: m.id, optionIndex }));

// Decision cards: the only path that trades.

test("approving a trade card places one simulated trade and a receipt", async () => {
  const m = await card([buy(25), { label: "Not now", kind: "dismiss" }]);
  const { messages } = (await body(await click(m))) as { messages: ChatMessage[] };
  assert.equal(messages[0].kind, "receipt");
  assert.match(messages[0].text, /^Bought \$25\.00 of AAPL .* Simulated: no real money moved\.$/);
  const s = await readStore();
  assert.equal(s.trades.length, 1);
  assert.equal(s.messages.find((x) => x.id === m.id)?.resolved, "Buy $25 of AAPL");
});

test("a double click on the same card trades once", async () => {
  const m = await card([buy(25)]);
  const results = await Promise.all([click(m), click(m), click(m)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal((await readStore()).trades.length, 1);
});

test("a trade that fails leaves the card open", async () => {
  const m = await card([buy(1_000_000), { label: "Not now", kind: "dismiss" }]);
  const { messages } = (await body(await click(m))) as { messages: ChatMessage[] };
  assert.match(messages[0].text, /^I didn't place that trade\. Not enough simulated cash/);
  const s = await readStore();
  assert.equal(s.trades.length, 0);
  assert.equal(s.messages.find((x) => x.id === m.id)?.resolved, undefined);
});

test("in live mode a card over the cap is refused on the server", async () => {
  await updateStore((s) => {
    s.mode = "live";
  });
  const m = await card([buy(500)]);
  const { messages } = (await body(await click(m))) as { messages: ChatMessage[] };
  assert.match(messages[0].text, /Live trades are capped at \$25 each/);
  assert.equal((await readStore()).trades.length, 0);
});

test("unknown cards, bad option numbers and decided cards are refused", async () => {
  const m = await card([{ label: "Not now", kind: "dismiss" }]);
  assert.equal((await action(post("/api/action", { messageId: "nope", optionIndex: 0 }))).status, 404);
  assert.equal((await click(m, 7)).status, 404);
  assert.equal((await click(m, "0")).status, 404);
  assert.equal((await click(m)).status, 200);
  assert.equal((await click(m)).status, 409);
});

test("a what-if button hands its scenario to the app", async () => {
  const m = await card([{ label: "Run a what-if: oil", kind: "what_if", payload: { scenario: "What if oil doubles?" } }]);
  assert.deepEqual(await body(await click(m)), { messages: [], next: { whatIf: "What if oil doubles?" } });
});

// Live mode.

test("live mode needs LIVE typed out and a connected brokerage", async () => {
  const noConfirm = await mode(post("/api/mode", { mode: "live" }));
  assert.equal(noConfirm.status, 400);
  assert.match(String((await body(noConfirm)).error), /Type LIVE to confirm/);
  assert.equal((await mode(post("/api/mode", { mode: "live", confirm: "live" }))).status, 400);

  const noBroker = await mode(post("/api/mode", { mode: "live", confirm: "LIVE" }));
  assert.equal(noBroker.status, 400);
  assert.match(String((await body(noBroker)).error), /Connect a brokerage account first/);
  assert.equal((await readStore()).mode, "paper");
});

test("a hosted copy never switches to live mode", async () => {
  process.env.VERCEL = "1";
  const res = await mode(post("/api/mode", { mode: "live", confirm: "LIVE" }));
  assert.equal(res.status, 400);
  assert.match(String((await body(res)).error), /only works when Atlas runs on your own computer/);
});

// Hosted: cron and sign-in.

const cronCall = (auth?: string) => cron(new Request("http://localhost:3000/api/cron/daily", { headers: auth ? { Authorization: auth } : {} }));

test("the cron route does nothing without the right secret", async () => {
  assert.equal((await cronCall("Bearer anything")).status, 401, "no CRON_SECRET set");
  process.env.CRON_SECRET = "s3cret";
  assert.equal((await cronCall()).status, 401);
  assert.equal((await cronCall("Bearer wrong")).status, 401);
  assert.deepEqual(await body(await cronCall("Bearer s3cret")), { ran: false }, "the schedule is off");
});

test("the cron route runs the daily check once a day", async () => {
  process.env.CRON_SECRET = "s3cret";
  await updateStore((s) => {
    s.daily.enabled = true;
    s.daily.depth = 0;
  });
  assert.equal((await body(await cronCall("Bearer s3cret"))).ran, true);
  const s = await readStore();
  assert.equal(s.messages.filter((m) => m.kind === "daily").length, 1);
  assert.equal(s.trades.length, 0);
  assert.deepEqual(await body(await cronCall("Bearer s3cret")), { ran: false });
});

test("sign-in hands out the session cookie only for the right password", async () => {
  process.env.ATLAS_PASSWORD = "open sesame";
  const wrong = await login(post("/api/login", { password: "open sesam" }));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);

  const ok = await login(post("/api/login", { password: "open sesame" }));
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie")!;
  assert.ok(cookie.startsWith(`atlas_session=${sessionToken("open sesame")};`));
  assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(cookie, /open sesame/);
});

test("with a username set, sign-in needs both the username and the password", async () => {
  process.env.ATLAS_PASSWORD = "open sesame";
  process.env.ATLAS_USERNAME = "reviewer";
  try {
    assert.equal((await login(post("/api/login", { password: "open sesame" }))).status, 401);
    assert.equal((await login(post("/api/login", { username: "someone", password: "open sesame" }))).status, 401);
    assert.equal((await login(post("/api/login", { username: "reviewer", password: "open sesame" }))).status, 200);
  } finally {
    delete process.env.ATLAS_USERNAME;
  }
});
