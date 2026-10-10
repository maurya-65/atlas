import { addMessages, newMessage, readStore } from "./store";
import { LIVE_LIMITS, liveSpentToday } from "./trading";
import type { ChatMessage } from "./types";

export interface TradeProposalInput {
  ticker: string;
  side: "BUY" | "SELL";
  dollars: number;
  title: string;
  reasoning: string;
  recommendation: string;
}

/**
 * Turns an AI suggestion into a decision card. This never trades: the only path that executes
 * is the user clicking an option (src/app/api/action/route.ts), which re-checks the live caps.
 * Used by both the in-app chat agent and the MCP server (Claude).
 */
export async function createTradeProposal(
  input: TradeProposalInput,
  opts: { origin?: string; save?: boolean } = {},
): Promise<{ message: ChatMessage | null; summary: string }> {
  const s = await readStore();
  let dollars = Math.round(input.dollars * 100) / 100;
  let note = "";
  if (s.mode === "live") {
    const left = Math.max(0, LIVE_LIMITS.perDay - (await liveSpentToday()));
    const cap = Math.min(LIVE_LIMITS.perTrade, left);
    if (cap <= 0) return { message: null, summary: `Today's $${LIVE_LIMITS.perDay} live limit is used up. No card was created; it resets tomorrow.` };
    if (dollars > cap) {
      note = ` (asked for $${dollars}; reduced to $${cap} to stay inside the live-mode limits)`;
      dollars = cap;
    }
  }
  const t = input.ticker.toUpperCase().trim();
  const verb = input.side === "BUY" ? "Buy" : "Sell";
  const where = s.mode === "live" ? "real money" : "simulated";
  const message = newMessage({
    kind: "constraint",
    origin: opts.origin,
    title: input.title,
    text: input.reasoning + note,
    recommendation: input.recommendation,
    options: [
      { label: `${verb} $${dollars} of ${t} (${where})`, kind: "approve_trade", recommended: true, payload: { ticker: t, side: input.side, dollars } },
      ...(dollars > 10 ? [{ label: `${verb} $10 instead`, kind: "approve_trade" as const, payload: { ticker: t, side: input.side, dollars: 10 } }] : []),
      { label: `Research ${t} first`, kind: "research", payload: { ticker: t } },
      { label: "Not now", kind: "dismiss" },
    ],
  });
  if (opts.save) await addMessages(message);
  return {
    message,
    summary: `Decision card created for ${verb} $${dollars} of ${t} in ${s.mode} mode${note}. Nothing has been traded; it waits for the user's click in Atlas (card id ${message.id}).`,
  };
}
