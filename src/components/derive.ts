import type { ChatMessage, Holding, Rule, Stance } from "@/lib/types";
import type { AppState } from "./format";

// Everything the pages show is worked out from what the store already holds: the saved cards, the rules and
// the portfolio. Nothing here is saved anywhere, so the same cards can be shown in a different arrangement
// without moving any data.

export const STANCE_LABEL: Record<Stance, string> = {
  consider_buying: "Consider buying more",
  consider_selling: "Consider selling some",
  hold_and_watch: "Hold and keep watching",
  not_enough_info: "Not enough information yet",
};

const newestFirst = (messages: ChatMessage[]) => [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const isResearch = (m: ChatMessage) => m.kind === "research" && Boolean(m.research);

/** Tickers a card is about, from its options (a trade, a research, a what-if on a stock). */
function tickersOf(m: ChatMessage): string[] {
  const found = new Set<string>();
  for (const o of m.options ?? []) if (o.payload?.ticker) found.add(o.payload.ticker.toUpperCase());
  if (m.research) found.add(m.research.ticker.toUpperCase());
  return [...found];
}

export interface VerdictPoint {
  messageId: string;
  at: string;
  stance: Stance;
  score: number;
  via: "atlas" | "claude";
}

export interface Company {
  ticker: string;
  name: string;
  holding: Holding | null;
  watched: boolean;
  /** The newest research card for this company */
  latest: ChatMessage;
  /** Oldest first, so the change over time reads left to right */
  verdicts: VerdictPoint[];
}

function holdingOf(state: AppState, ticker: string): Holding | null {
  return state.portfolio?.holdings.find((h) => h.ticker.toUpperCase() === ticker) ?? null;
}

function verdictsFor(research: ChatMessage[]): VerdictPoint[] {
  return [...research]
    .reverse()
    .map((m) => ({
      messageId: m.id,
      at: m.research!.generatedAt,
      stance: m.research!.stance,
      score: m.research!.confidenceScore ?? 0,
      via: m.research!.via === "claude" ? ("claude" as const) : ("atlas" as const),
    }));
}

/** Every company Atlas has researched, most recently researched first. */
export function companies(state: AppState): Company[] {
  const byTicker = new Map<string, ChatMessage[]>();
  for (const m of newestFirst(state.messages.filter(isResearch))) {
    const t = m.research!.ticker.toUpperCase();
    byTicker.set(t, [...(byTicker.get(t) ?? []), m]);
  }
  return [...byTicker.entries()].map(([ticker, research]) => {
    const holding = holdingOf(state, ticker);
    return {
      ticker,
      name: holding?.name || research[0].research!.companyName || ticker,
      holding,
      watched: state.watchlist.includes(ticker),
      latest: research[0],
      verdicts: verdictsFor(research),
    };
  });
}

export interface CompanyDetail {
  ticker: string;
  name: string;
  holding: Holding | null;
  watched: boolean;
  /** Newest first */
  research: ChatMessage[];
  verdicts: VerdictPoint[];
  /** Decision cards that name this company, newest first */
  decisions: ChatMessage[];
  /** Price rules set on this company */
  rules: Rule[];
}

/** One company's page: works for a company with no research yet too (a holding or a watchlist entry). */
export function companyDetail(state: AppState, ticker: string): CompanyDetail {
  const t = ticker.toUpperCase();
  const research = newestFirst(state.messages.filter((m) => isResearch(m) && m.research!.ticker.toUpperCase() === t));
  const holding = holdingOf(state, t);
  return {
    ticker: t,
    name: holding?.name || research[0]?.research?.companyName || t,
    holding,
    watched: state.watchlist.includes(t),
    research,
    verdicts: verdictsFor(research),
    decisions: newestFirst(state.messages.filter((m) => m.kind === "constraint" && tickersOf(m).includes(t))),
    rules: state.rules.filter((r) => r.ticker?.toUpperCase() === t),
  };
}

/** What-if and sector cards, newest first. */
export function scenarios(messages: ChatMessage[]): ChatMessage[] {
  return newestFirst(messages.filter((m) => m.kind === "scenario" && m.scenario));
}

export const pendingDecisions = (messages: ChatMessage[]) => newestFirst(messages.filter((m) => m.kind === "constraint" && !m.resolved));

/** Cards the user has answered, with the choice they made in `resolved`. */
export const decidedDecisions = (messages: ChatMessage[]) => newestFirst(messages.filter((m) => m.kind === "constraint" && m.resolved));

export const receipts = (messages: ChatMessage[]) => newestFirst(messages.filter((m) => m.kind === "receipt"));

export const briefs = (messages: ChatMessage[]) => newestFirst(messages.filter((m) => m.kind === "daily" && m.daily));

export type HistoryFilter = "all" | "research" | "decisions" | "briefs" | "trades" | "alerts";

const HISTORY_KINDS: Record<Exclude<HistoryFilter, "all">, ChatMessage["kind"][]> = {
  research: ["research", "scenario"],
  decisions: ["constraint"],
  briefs: ["daily"],
  trades: ["receipt"],
  alerts: ["thought"],
};

/** Everything Atlas did, newest first. Chat questions and answers stay in Chat. */
export function historyItems(messages: ChatMessage[], filter: HistoryFilter = "all"): ChatMessage[] {
  const kinds = filter === "all" ? Object.values(HISTORY_KINDS).flat() : HISTORY_KINDS[filter];
  return newestFirst(messages.filter((m) => kinds.includes(m.kind)));
}

export interface SinceLastCheck {
  /** The newest daily brief, if there is one */
  brief: ChatMessage | null;
  /** What the rules flag: from the brief, or live from the portfolio when there is no brief yet */
  flags: string[];
  /** Research the latest brief did */
  researched: { ticker: string; stance: Stance | null; score: number | null }[];
}

export function sinceLastCheck(state: AppState): SinceLastCheck {
  const brief = briefs(state.messages)[0] ?? null;
  if (brief?.daily) {
    return { brief, flags: brief.daily.flags, researched: brief.daily.researched.map((r) => ({ ticker: r.ticker, stance: r.stance, score: r.confidenceScore })) };
  }
  return { brief: null, flags: state.ruleStatus.flatMap((s) => s.hits), researched: [] };
}
