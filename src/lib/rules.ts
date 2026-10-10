import { newMessage } from "./store";
import { isFund, isResearchableStock, type CardOption, type ChatMessage, type Holding, type Portfolio, type Rule } from "./types";

// Rule checks are plain arithmetic, so they run in code, not through a model.

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export interface RuleHit {
  /** Stable key so the same finding isn't repeated every scan */
  key: string;
  rule: Rule;
  message: ChatMessage;
}

/** "Research X" only for company stocks; funds and crypto have no filings for the analysts to read. */
function researchOption(h: Holding, recommended: boolean): CardOption[] {
  if (!isResearchableStock(h.ticker, h.kind)) return [];
  return [{ label: `Research ${h.ticker}`, kind: "research", recommended: recommended || undefined, payload: { ticker: h.ticker } }];
}

export function evaluateRules(p: Portfolio, rules: Rule[]): RuleHit[] {
  const hits: RuleHit[] = [];
  const total = p.total || 1;

  for (const rule of rules) {
    const t = (rule.threshold ?? 0) / 100;
    switch (rule.kind) {
      case "concentration":
        for (const h of p.holdings) {
          // The rule is about one company being too much of the portfolio. A fund already holds many.
          if (isFund(h.ticker, h.kind)) continue;
          const share = h.value / total;
          if (share > t) {
            const trimTo = t * total;
            const excess = Math.max(0, h.value - trimTo);
            hits.push(
              hit(rule, `conc:${h.ticker}:${Math.round(share * 20)}`, {
                title: `${h.ticker} is ${pct(share)} of your portfolio`,
                text:
                  `Your rule says no single stock should be more than ${rule.threshold}% of your portfolio. ${h.ticker} is now ${usd(h.value)} out of ${usd(total)}.\n\n` +
                  `Why this matters: when one company is a big slice of everything you own, one bad news day for that company hits your whole portfolio.`,
                recommendation:
                  rule.action === "propose"
                    ? `Sell a small amount of ${h.ticker} to move back toward your limit. I'd start with $25 rather than the full ${usd(excess)}.`
                    : isResearchableStock(h.ticker, h.kind)
                      ? `No rush. I'd research ${h.ticker} first to see whether anything recent explains the run-up before deciding to trim.`
                      : `No rush. Nothing has to happen today; trimming a little at a time is one way to move back toward your limit.`,
                options:
                  rule.action === "propose"
                    ? [
                        { label: `Sell $25 of ${h.ticker}`, kind: "approve_trade", recommended: true, payload: { ticker: h.ticker, side: "SELL", dollars: 25 } },
                        ...researchOption(h, false),
                        { label: "Leave it", kind: "dismiss" },
                      ]
                    : [
                        ...researchOption(h, true),
                        { label: `Sell $25 of ${h.ticker}`, kind: "approve_trade", payload: { ticker: h.ticker, side: "SELL", dollars: 25 } },
                        { label: "Leave it", kind: "dismiss" },
                      ],
              }),
            );
          }
        }
        break;

      case "drawdown":
        for (const h of p.holdings) {
          if (h.pnlPct !== null && h.pnlPct <= -t) {
            hits.push(
              hit(rule, `dd:${h.ticker}:${Math.round(h.pnlPct * 20)}`, {
                title: `${h.ticker} is down ${pct(-h.pnlPct)} from what you paid`,
                text:
                  `You paid about ${usd(h.avgCost!)} per share and it's now ${usd(h.price)}. Your rule flags drops of ${rule.threshold}% or more.\n\n` +
                  `A drop alone doesn't mean "sell". What matters is why it dropped: a temporary scare, or something that changes the business.`,
                recommendation: isResearchableStock(h.ticker, h.kind)
                  ? `Let me research ${h.ticker} so you can see what's behind the drop before deciding anything.`
                  : `Find out what moved ${h.ticker} before deciding anything. A drop by itself is not a reason to sell.`,
                options: [
                  ...researchOption(h, true),
                  ...(rule.action === "propose"
                    ? [{ label: `Sell $25 of ${h.ticker}`, kind: "approve_trade" as const, payload: { ticker: h.ticker, side: "SELL" as const, dollars: 25 } }]
                    : []),
                  { label: "Keep holding", kind: "dismiss" },
                ],
              }),
            );
          }
        }
        break;

      case "idle_cash": {
        const share = p.cash / total;
        if (share > t) {
          hits.push(
            hit(rule, `cash:${Math.round(share * 20)}`, {
              kind: "thought",
              text: `${pct(share)} of your portfolio (${usd(p.cash)}) is sitting in cash, above the ${rule.threshold}% you said to flag. That's not a problem by itself; it's just money that isn't invested. If you want, tell me an industry you're curious about and I'll research options.`,
            }),
          );
        }
        break;
      }

      case "price_below":
      case "price_above": {
        const h = p.holdings.find((x) => x.ticker === rule.ticker);
        if (!h || rule.threshold === undefined) break;
        const crossed = rule.kind === "price_below" ? h.price < rule.threshold : h.price > rule.threshold;
        if (crossed) {
          const word = rule.kind === "price_below" ? "below" : "above";
          hits.push(
            hit(rule, `px:${rule.id}:${word}`, {
              title: `${h.ticker} is ${word} ${usd(rule.threshold)}`,
              text: `You asked me to watch for ${h.ticker} going ${word} ${usd(rule.threshold)}. It's at ${usd(h.price)} now.`,
              recommendation: isResearchableStock(h.ticker, h.kind)
                ? `Research before acting, so the decision is based on why the price moved.`
                : `Find out why the price moved before acting.`,
              options: [
                ...researchOption(h, true),
                {
                  label: `${rule.kind === "price_below" ? "Buy" : "Sell"} $25 of ${h.ticker}`,
                  kind: "approve_trade",
                  payload: { ticker: h.ticker, side: rule.kind === "price_below" ? "BUY" : "SELL", dollars: 25 },
                },
                { label: "Ignore", kind: "dismiss" },
              ],
            }),
          );
        }
        break;
      }

      case "news_watch":
        // Handled by the news/filings scan (scan.ts), which treats the topic as an interest.
        break;
    }
  }
  return hits;
}

function hit(
  rule: Rule,
  key: string,
  m: { kind?: "thought" | "constraint"; title?: string; text: string; recommendation?: string; options?: ChatMessage["options"] },
): RuleHit {
  return {
    key: `rule:${key}`,
    rule,
    message: newMessage({
      kind: m.kind ?? "constraint",
      title: m.title,
      text: m.text + `\n\nYour rule: "${rule.text}"`,
      recommendation: m.recommendation,
      options: m.options,
    }),
  };
}
