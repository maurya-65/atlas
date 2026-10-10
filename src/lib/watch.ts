import { readStore, updateStore } from "./store";
import { activePortfolio } from "./portfolio";
import { evaluateRules } from "./rules";
import { runScan } from "./scan";
import type { ChatMessage } from "./types";

/**
 * One "watch" pass: deterministic rule checks on the portfolio, then the public-sources scan
 * (filings, news, government notices). Returns new messages, already saved to the thread.
 */
export async function watchOnce(): Promise<ChatMessage[]> {
  const s = await readStore();
  const portfolio = await activePortfolio();

  const ruleHits = evaluateRules(portfolio, s.rules).filter((h) => !s.seenSignals.includes(h.key));
  const scan = await runScan({ portfolio, interests: s.interests, rules: s.rules, seen: s.seenSignals });

  const messages = [...ruleHits.map((h) => h.message), ...scan.messages];
  await updateStore((st) => {
    st.messages.push(...messages);
    st.seenSignals = [...new Set([...st.seenSignals, ...ruleHits.map((h) => h.key), ...scan.seenIds])].slice(-3000);
    st.lastScanAt = new Date().toISOString();
  });
  return messages;
}
