import { post } from "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { anthropic } from "../src/lib/llm";
import { answer } from "../src/lib/chat";
import { POST as threads } from "../src/app/api/threads/route";
import { addMessages, newMessage, readStore, resetStore } from "../src/lib/store";
import { say, threadsOf } from "../src/lib/threads";

const A = "aaaaaaaa-1111";
const B = "bbbbbbbb-2222";

let call: { model: string; effort: string; prompt: string } | null = null;
let next: unknown = null;

beforeEach(async () => {
  await resetStore();
  call = null;
  next = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replacing an SDK method with a test double
  (anthropic.beta.messages as any).parse = async (params: any) => {
    call = { model: params.model, effort: params.output_config.effort, prompt: params.messages[0].content };
    return { stop_reason: "end_turn", parsed_output: { answer: "Your biggest holding is NVDA.", note: "Asked about the biggest holding.", next } };
  };
});

test("a question is answered by the cheaper model at medium effort, inside its own chat", async () => {
  await say(A, "What is my biggest holding?");
  const reply = await answer(A);
  assert.equal(reply.threadId, A);
  assert.equal(reply.kind, "agent");
  assert.deepEqual([call?.model, call?.effort], ["claude-sonnet-5-5", "medium"]);
  assert.match(call!.prompt, /Question: What is my biggest holding\?$/);
  // Whether a rule is crossed is told to the model, worked out in code: the demo portfolio is 33.1% NVDA and 31.3% AAPL.
  assert.match(call!.prompt, /grows past 25% of my portfolio\. \(crossed right now: NVDA is 33\.1% of your portfolio; AAPL is 31\.3% of your portfolio\)/);
  assert.deepEqual((await readStore()).memory.map((n) => n.text), ["Asked about the biggest holding."]);
});

test("an answer sees its own chat and not the others", async () => {
  await say(B, "Tell me about bonds");
  await addMessages(newMessage({ kind: "agent", text: "Bonds are loans.", threadId: B }));
  await say(A, "First question");
  await addMessages(newMessage({ kind: "agent", text: "First answer.", threadId: A }));
  await say(A, "And the follow-up?");
  await answer(A);
  assert.match(call!.prompt, /This chat so far:\nUser: First question\nAtlas: First answer\.\n\nQuestion: And the follow-up\?/);
  assert.doesNotMatch(call!.prompt, /bonds/i);
});

test("an answer that needs research or a what-if comes with a button for it", async () => {
  const asked = async (suggestion: unknown) => {
    next = suggestion;
    await say(A, "a question");
    return (await answer(A)).options;
  };
  const research = (await asked({ kind: "research", value: "tsla" }))!;
  assert.deepEqual(research[0], { label: "Research TSLA", kind: "research", recommended: true, payload: { ticker: "TSLA" } });
  // The same research can run in Claude, on the user's own plan.
  assert.deepEqual([research[1].kind, research[1].label, research[1].payload?.ticker], ["open_claude", "Deep research TSLA in Claude", "TSLA"]);
  assert.match(research[1].payload!.url!, /^https:\/\/claude\.ai\/new\?q=/);
  const oil = "What if oil prices double next year?";
  assert.deepEqual(await asked({ kind: "what_if", value: oil }), [
    { label: `Run a what-if: ${oil}`, kind: "what_if", recommended: true, payload: { scenario: oil } },
  ]);
  assert.equal(await asked(null), undefined);
  // Not something the research can read, or not a ticker at all: no button.
  assert.equal(await asked({ kind: "research", value: "SPY" }), undefined);
  assert.equal(await asked({ kind: "research", value: "Tesla Motors" }), undefined);
  assert.equal(await asked({ kind: "what_if", value: "x" }), undefined);
});

test("there has to be a question to answer", async () => {
  await assert.rejects(answer(A), /nothing to answer/);
  await say(A, "Hello");
  await answer(A);
  await assert.rejects(answer(A), /nothing to answer/);
});

test("chats are listed newest first, titled by their first question, and can be deleted", async () => {
  await say(A, "x".repeat(80));
  await say(B, "Second chat");
  await addMessages(newMessage({ kind: "agent", text: "Found something on its own." }));
  const list = threadsOf((await readStore()).messages);
  assert.deepEqual(list.map((t) => t.id), [B, A]);
  assert.equal(list[1].title, `${"x".repeat(47)}…`);

  assert.equal((await threads(post("/api/threads", { action: "delete", threadId: A }))).status, 200);
  const s = await readStore();
  assert.equal(s.messages.some((m) => m.threadId === A), false);
  assert.ok(s.messages.some((m) => m.threadId === B));
  assert.ok(s.messages.some((m) => !m.threadId), "what Atlas found on its own stays in the Inbox");
});

test("chat requests with a bad id or nothing to say are refused", async () => {
  assert.equal((await threads(post("/api/threads", { action: "say", threadId: "../x", text: "hi" }))).status, 400);
  assert.equal((await threads(post("/api/threads", { action: "say", threadId: A, text: "  " }))).status, 400);
  assert.equal((await threads(post("/api/threads", { action: "say", threadId: A, text: "x".repeat(501) }))).status, 400);
  assert.equal((await threads(post("/api/threads", { action: "say", threadId: A, text: "hi" }))).status, 200);
});
