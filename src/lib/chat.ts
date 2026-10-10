import { z } from "zod";
import { CHAT_MODEL, structured } from "./llm";
import { activePortfolio } from "./portfolio";
import { addMessages, newMessage, readStore, updateStore } from "./store";
import type { ChatMessage, MemoryNote } from "./types";

// Questions in a chat. The model gets the portfolio, the chat so far and Atlas's notes, but no tools, so an
// answer can never trade or look anything up. Each answer leaves a one-line note: those notes are the memory.

const MAX_NOTES = 40;
const HISTORY_LINES = 12;
const LINE_LENGTH = 500;

const Answer = z.object({
  answer: z.string().describe("The reply, in plain words: two to four short sentences unless the question needs more. No headings or lists."),
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

  const earlier = chat.slice(0, -1).map(lineOf).filter((l) => l !== null).slice(-HISTORY_LINES);

  const out = await structured({
    model: CHAT_MODEL,
    effort: "medium",
    maxTokens: 4000,
    schema: Answer,
    system:
      "You are Atlas, an investing assistant for someone with no finance background. Answer in plain words and explain any term in half a sentence. " +
      "The portfolio, rules and notes below are the only facts you have about the user's money; use them when the question is about it. " +
      "You cannot look anything up: for recent news about a company, say that Research or a what-if in Atlas will check it. " +
      "You cannot trade: decisions are made on Atlas's cards. Give information, not instructions to buy or sell. If you don't know, say so. Write tickers exactly as they appear in the portfolio.",
    prompt:
      `Portfolio (${p.sourceLabel}): $${p.total.toFixed(0)} in total, $${p.cash.toFixed(0)} of it cash.\n${holdings.join("\n") || "(no holdings)"}\n\n` +
      `Rules the user set:\n${s.rules.map((r) => `- ${r.text}`).join("\n") || "(none)"}\n\n` +
      `Topics they follow: ${s.interests.join(", ") || "(none)"}\n\n` +
      `Atlas's research so far:\n${[...verdicts.values()].join("\n") || "(none)"}\n\n` +
      `What Atlas remembers from earlier conversations:\n${s.memory.map((n) => `- ${n.at.slice(0, 10)}: ${n.text}`).join("\n") || "(nothing yet)"}\n\n` +
      (earlier.length ? `This chat so far:\n${earlier.join("\n")}\n\n` : "") +
      `Question: ${question.text}`,
  });

  const [reply] = await addMessages(newMessage({ kind: "agent", text: out.answer.trim(), threadId }));
  await remember(out.note, "atlas");
  return reply;
}
