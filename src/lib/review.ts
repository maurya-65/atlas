import { addMessages, newMessage, readStore } from "./store";
import { activePortfolio } from "./portfolio";
import { researchTicker } from "./research";
import { claudeOption, parseClaudeReport } from "./handoff";
import { lookupCompany } from "./sources";
import { isResearchableStock } from "./types";
import type { CardOption, ChatMessage, Holding, Portfolio, ResearchEvent, ResearchResult } from "./types";

// Portfolio review: deep research on the biggest positions, one at a time (each run already fires
// several Opus agents in parallel, and running stocks side by side would hit API rate limits).

const REVIEW_COUNT = 3;
const SUGGESTED_TRADE_DOLLARS = 25;

const VERDICT: Record<ResearchResult["stance"], string> = {
  consider_buying: "Consider buying more",
  consider_selling: "Consider selling some",
  hold_and_watch: "Hold and keep watching",
  not_enough_info: "Not enough information yet",
};

/** Decision buttons under a research card. Trades still only happen when the user clicks approve. */
export function researchOptions(r: ResearchResult, holding: Holding | undefined, portfolioTotal: number): CardOption[] {
  const held = Boolean(holding);
  const options: CardOption[] = [];
  if (r.stance === "consider_buying") {
    options.push({
      label: `Buy $${SUGGESTED_TRADE_DOLLARS} ${held ? "more " : ""}of ${r.ticker}`,
      kind: "approve_trade",
      recommended: true,
      payload: { ticker: r.ticker, side: "BUY", dollars: SUGGESTED_TRADE_DOLLARS },
    });
  }
  if (r.stance === "consider_selling" && held) {
    options.push({
      label: `Sell $${SUGGESTED_TRADE_DOLLARS} of ${r.ticker}`,
      kind: "approve_trade",
      recommended: true,
      payload: { ticker: r.ticker, side: "SELL", dollars: SUGGESTED_TRADE_DOLLARS },
    });
  }
  options.push({
    label: `Keep watching ${r.companyName.split(" ")[0] || r.ticker}`,
    kind: "add_interest",
    recommended: options.length === 0,
    payload: { topic: r.companyName || r.ticker },
  });
  if (r.via !== "claude") {
    options.push(
      claudeOption(
        { ticker: r.ticker, name: r.companyName, holding, portfolioTotal, quick: r },
        "Go deeper in Claude (~10 min, free with Pro)",
      ),
    );
  }
  options.push({ label: "Not now", kind: "dismiss" });
  return options;
}

/** Run deep research on one ticker and post the card. */
export async function researchAndPost(
  ticker: string,
  opts: { text?: string; origin?: string; onEvent?: (e: ResearchEvent) => void } = {},
) {
  const [p, s] = await Promise.all([activePortfolio(), readStore()]);
  const holding = p.holdings.find((h) => h.ticker === ticker);
  const research = await researchTicker(ticker, { holding, portfolioTotal: p.total, interests: s.interests, onEvent: opts.onEvent });
  const [message] = await addMessages(
    newMessage({
      kind: "research",
      text: opts.text ?? "",
      origin: opts.origin,
      research,
      sources: research.sources,
      options: researchOptions(research, holding, p.total),
    }),
  );
  return message;
}

/** Turn a Claude Deep Research answer the user pasted back into a research card. No API call. */
export async function importClaudeReport(pasted: string, expectedTicker?: string) {
  const research = parseClaudeReport(pasted, expectedTicker);
  const [p, co] = await Promise.all([activePortfolio(), lookupCompany(research.ticker).catch(() => null)]);
  if (co?.name) research.companyName = co.name;
  const holding = p.holdings.find((h) => h.ticker === research.ticker);
  if (holding) research.position = { value: holding.value, weight: p.total ? holding.value / p.total : 0, pnlPct: holding.pnlPct };
  const [message] = await addMessages(
    newMessage({
      kind: "research",
      text: "",
      origin: "Claude Deep Research",
      research,
      sources: research.sources,
      options: researchOptions(research, holding, p.total),
    }),
  );
  return message;
}

function pickHoldings(p: Portfolio) {
  const ok = [...p.holdings].filter((h) => h.value > 0 && isResearchableStock(h.ticker));
  return ok.sort((a, b) => b.value - a.value).slice(0, REVIEW_COUNT);
}

/**
 * Deep-research the biggest holdings, posting each card as soon as it's ready (the app polls while busy),
 * then a short summary. Returns everything it posted.
 */
export async function reviewPortfolio(opts: { origin?: string; onEvent?: (e: ResearchEvent) => void } = {}): Promise<ChatMessage[]> {
  const p = await activePortfolio();
  const picks = pickHoldings(p);
  if (!picks.length) {
    return addMessages(
      newMessage({ kind: "agent", origin: opts.origin, text: "You don't hold any stocks yet, so there's nothing to review. Research a ticker below instead." }),
    );
  }
  const total = p.total || 1;
  const posted: ChatMessage[] = [];
  posted.push(
    ...(await addMessages(
      newMessage({
        kind: "agent",
        origin: opts.origin,
        text:
          `Reviewing your ${picks.length} biggest holdings: ${picks.map((h) => `**${h.ticker}** (${((h.value / total) * 100).toFixed(0)}%)`).join(", ")}. ` +
          "For each one, four analyst agents research a different angle, debate each other, and a judge gives a verdict with a confidence score. Cards appear as each finishes.",
      }),
    )),
  );

  const results: { ticker: string; weight: number; r: ResearchResult | null }[] = [];
  for (const [i, h] of picks.entries()) {
    const weight = h.value / total;
    try {
      const m = await researchAndPost(h.ticker, {
        origin: opts.origin,
        onEvent: opts.onEvent,
        text: `**Portfolio review ${i + 1}/${picks.length}:** ${h.ticker} is ${(weight * 100).toFixed(1)}% of your portfolio${i === 0 ? ", your biggest position" : ""}.`,
      });
      posted.push(m);
      results.push({ ticker: h.ticker, weight, r: m.research ?? null });
    } catch {
      results.push({ ticker: h.ticker, weight, r: null });
    }
  }

  const lines = results.map(({ ticker, weight, r }) =>
    r
      ? `- **${ticker}** (${(weight * 100).toFixed(0)}% of portfolio): ${VERDICT[r.stance]}, confidence **${r.confidenceScore ?? "?"}/100**`
      : `- **${ticker}**: research didn't finish. Try it again on its own.`,
  );
  posted.push(
    ...(await addMessages(
      newMessage({
        kind: "agent",
        origin: opts.origin,
        text: `**Portfolio review done.**\n${lines.join("\n")}\n\nThe buttons on each card are suggestions. Nothing is bought or sold unless you click.`,
      }),
    )),
  );
  return posted;
}
