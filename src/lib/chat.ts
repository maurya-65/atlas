import { z } from "zod";
import { CHAT_MODEL, structured } from "./llm";
import { claudeOption } from "./handoff";
import { activePortfolio } from "./portfolio";
import { ruleStatus } from "./rules";
import { addMessages, newMessage, readStore, updateStore } from "./store";
import { isResearchableStock, type CardOption, type ChatMessage, type MemoryNote, type Portfolio } from "./types";

// Questions in a chat. The model gets the portfolio, the chat so far and Atlas's notes, but no tools, so an
// answer can never trade or look anything up. Each answer leaves a one-line note: those notes are the memory.

const MAX_NOTES = 40;
const HISTORY_LINES = 12;
const LINE_LENGTH = 500;

const Answer = z.object({
  answer: z.string().describe("The reply, in plain words: two to four short sentences unless the question needs more. No headings or lists."),
  next: z
    .object({
      kind: z.enum(["research", "what_if"]),
      value: z.string().describe("research: the ticker symbol. what_if: one sentence describing the event or the sector question."),
    })
    .nullable()
    .describe("A longer job Atlas can run to answer this properly, or null when the portfolio is enough."),
  note: z.string().describe("One sentence for Atlas's memory: what was asked, the gist of the answer, and any preference or decision the user stated."),
});

export async function remember(text: string, from: MemoryNote["from"]): Promise<void> {
  const note = text.trim().slice(0, 400);
  if (!note) return;
  await updateStore((s) => {
    s.memory = [...s.memory, { text: note, from, at: new Date().toISOString() }].slice(-MAX_NOTES);
  });
}

/** One line of a chat for the model. Research and what-if cards are summed up, not pasted whole. */
function lineOf(m: ChatMessage): string | null {
  const cut = (t: string) => (t.length > LINE_LENGTH ? `${t.slice(0, LINE_LENGTH)}…` : t);
  if (m.kind === "user") return `User: ${cut(m.text)}`;
  if (m.kind === "agent") return `Atlas: ${cut(m.text)}`;
  if (m.kind === "research" && m.research) {
    const r = m.research;
    return `Atlas researched ${r.ticker}: ${r.stance.replace(/_/g, " ")}, confidence ${r.confidenceScore ?? "?"}/100. ${cut(r.thesis)}`;
  }
  if (m.kind === "scenario" && m.scenario) return `Atlas ran a what-if, "${m.scenario.scenario}": ${cut(m.scenario.headline)}`;
  return null;
}

/**
 * The buttons under an answer that needs more than a chat reply: research on one stock, or a what-if. These
 * take a minute or two, so the user starts them with a click. A stock can also be researched in Claude, which
 * runs on the user's Claude plan instead of Atlas's API key. Anything the model suggests that isn't valid is dropped.
 */
function nextStep(next: z.infer<typeof Answer>["next"] | undefined, p: Portfolio): CardOption[] {
  if (!next) return [];
  const value = next.value.trim();
  if (next.kind === "research") {
    const ticker = value.toUpperCase();
    const held = p.holdings.find((h) => h.ticker === ticker);
    if (!/^[A-Z.\-]{1,10}$/.test(ticker) || !isResearchableStock(ticker, held?.kind)) return [];
    return [
      { label: `Research ${ticker}`, kind: "research", recommended: true, payload: { ticker } },
      claudeOption({ ticker, name: held?.name, holding: held, portfolioTotal: p.total }),
    ];
  }
  if (value.length < 3 || value.length > 500) return [];
  const short = value.length > 60 ? `${value.slice(0, 59).trimEnd()}…` : value;
  return [{ label: `Run a what-if: ${short}`, kind: "what_if", recommended: true, payload: { scenario: value } }];
}

/** Answer the last message of a chat, which has to be the user's. Returns the answer. */
export async function answer(threadId: string): Promise<ChatMessage> {
  const [p, s] = await Promise.all([activePortfolio(), readStore()]);
  const chat = s.messages.filter((m) => m.threadId === threadId);
  const question = chat.at(-1);
  if (question?.kind !== "user") throw new Error("There is nothing to answer in this chat yet.");

  const total = p.total || 1;
  const holdings = p.holdings
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((h) => {
      const change = h.pnlPct == null ? "" : `, ${h.pnlPct >= 0 ? "up" : "down"} ${Math.abs(h.pnlPct * 100).toFixed(1)}% since bought`;
      return `- ${h.ticker} (${h.name || h.ticker}): $${h.value.toFixed(0)}, ${((h.value / total) * 100).toFixed(1)}% of the portfolio${change}`;
    });

  const verdicts = new Map<string, string>();
  for (const m of s.messages) {
    if (m.kind !== "research" || !m.research) continue;
    const r = m.research;
    verdicts.set(r.ticker, `- ${r.ticker}: ${r.stance.replace(/_/g, " ")}, confidence ${r.confidenceScore ?? "?"}/100 (${r.generatedAt.slice(0, 10)})`);
  }

  // Whether a rule is crossed is worked out here, not left for the model to read off the numbers.
  const status = new Map(ruleStatus(p, s.rules).map((r) => [r.id, r.hits]));
  const rules = s.rules.map((r) => `- ${r.text} (${status.get(r.id)?.length ? `crossed right now: ${status.get(r.id)!.join("; ")}` : "fine right now"})`);

  const earlier = chat.slice(0, -1).map(lineOf).filter((l) => l !== null).slice(-HISTORY_LINES);

  const out = await structured({
    model: CHAT_MODEL,
    effort: "medium",
    maxTokens: 4000,
    schema: Answer,
    system:
      "You are Atlas, an investing assistant for someone with no finance background. Answer in plain words and explain any term in half a sentence. " +
      "The portfolio, rules and notes below are the only facts you have about the user's money; use them when the question is about it. " +
      "You cannot look anything up. When the question needs fresh information or a verdict you can't give from the portfolio (recent news, whether to buy or sell a particular stock, what is happening in a sector, how an event would affect the portfolio), " +
      "keep the answer to one or two sentences (say you can't settle it from the portfolio alone, add only what the portfolio shows about this question, and say Atlas can run it), and set next: research with the ticker for one company, or what_if with a sentence describing the event or sector. Otherwise next is null. Never tell the user to switch modes. " +
      "You cannot trade: decisions are made on Atlas's cards. Give information, not instructions to buy or sell. If you don't know, say so. Write tickers exactly as they appear in the portfolio.",
    prompt:
      `Portfolio (${p.sourceLabel}): $${p.total.toFixed(0)} in total, $${p.cash.toFixed(0)} of it cash.\n${holdings.join("\n") || "(no holdings)"}\n\n` +
      `Rules the user set:\n${rules.join("\n") || "(none)"}\n\n` +
      `Topics they follow: ${s.interests.join(", ") || "(none)"}\n\n` +
      `Atlas's research so far:\n${[...verdicts.values()].join("\n") || "(none)"}\n\n` +
      `What Atlas remembers from earlier conversations:\n${s.memory.map((n) => `- ${n.at.slice(0, 10)}: ${n.text}`).join("\n") || "(nothing yet)"}\n\n` +
      (earlier.length ? `This chat so far:\n${earlier.join("\n")}\n\n` : "") +
      `Question: ${question.text}`,
  });

  const options = nextStep(out.next, p);
  const [reply] = await addMessages(newMessage({ kind: "agent", text: out.answer.trim(), threadId, ...(options.length ? { options } : {}) }));
  await remember(out.note, "atlas");
  return reply;
}
