export type Mode = "paper" | "live";

export interface Holding {
  ticker: string;
  name: string;
  units: number;
  price: number;
  value: number;
  avgCost: number | null;
  /** Change from average purchase price, e.g. -0.12 = down 12% */
  pnlPct: number | null;
  /** What the broker says this is ("stock", "adr", "etf", "mutualfund", "crypto", …), when it says */
  kind?: string | null;
}

export interface Portfolio {
  source: "snaptrade" | "paper" | "demo";
  /** Plain-words description of where these numbers come from */
  sourceLabel: string;
  accountId: string | null;
  accountName: string | null;
  brokerIsPaper: boolean | null;
  holdings: Holding[];
  cash: number;
  total: number;
  recentOrders: { ticker: string; action: string; status: string; quantity: string; time: string }[];
}

export type RuleKind =
  | "concentration"
  | "drawdown"
  | "idle_cash"
  | "price_below"
  | "price_above"
  | "news_watch";

export interface Rule {
  id: string;
  kind: RuleKind;
  /** The user's own words, or a plain-English rendering of the rule */
  text: string;
  /** Percent thresholds are stored as whole numbers (25 = 25%) */
  threshold?: number;
  ticker?: string;
  topic?: string;
  /** flag = just tell me; propose = suggest a trade that I approve */
  action: "flag" | "propose";
  createdAt: string;
}

/** open_claude is a plain link to claude.ai (payload.url); it never reaches the server. */
export type ActionKind = "approve_trade" | "research" | "what_if" | "add_interest" | "dismiss" | "open_claude";

export interface CardOption {
  label: string;
  kind: ActionKind;
  /** Recommended option is rendered first and labelled */
  recommended?: boolean;
  payload?: {
    ticker?: string;
    side?: "BUY" | "SELL";
    dollars?: number;
    topic?: string;
    /** For what_if: the scenario to run */
    scenario?: string;
    url?: string;
    /** Always simulate this trade in the paper book, even in live mode (daily-run suggestions) */
    paper?: boolean;
  };
}

export interface SourceRef {
  title: string;
  url: string;
  publisher?: string;
  date?: string;
}

export type MessageKind = "user" | "agent" | "thought" | "constraint" | "research" | "receipt" | "scenario" | "daily" | "ideas";

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  text: string;
  createdAt: string;
  /** constraint */
  title?: string;
  recommendation?: string;
  options?: CardOption[];
  resolved?: string;
  sources?: SourceRef[];
  /** research */
  research?: ResearchResult;
  /** receipt */
  mode?: Mode;
  /** scenario (what-if) */
  scenario?: ScenarioResult;
  /** daily run brief */
  daily?: DailyBrief;
  /** ideas: one "what could I invest in" session */
  ideas?: IdeaSession;
  /** where the card came from, e.g. "Claude (via Atlas MCP)" */
  origin?: string;
  /** The chat this message belongs to. Messages without one are what Atlas found on its own and show up on Home and in History. */
  threadId?: string;
}

/** A chat, worked out from the messages that share a threadId. */
export interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
}

/** One line Atlas keeps about a conversation, so later answers have context. */
export interface MemoryNote {
  text: string;
  at: string;
  /** "atlas" = a question asked in the app; "claude" = saved by Claude through the MCP server */
  from: "atlas" | "claude";
}

export interface GraphNode {
  id: string;
  label: string;
  type: "company" | "event" | "regulation" | "labor" | "financials" | "source" | "sector" | "person" | "scenario" | "channel" | "holding";
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export type Stance = "consider_buying" | "consider_selling" | "hold_and_watch" | "not_enough_info";

/** One analyst agent's view from a single research angle, before and after the debate round. */
export interface ResearchAngle {
  name: string;
  focus: string;
  sourcesRead: number;
  stance: Stance;
  /** 0-100 */
  score: number;
  /** Short report; citations are [n] = sources[n - 1] */
  report: string;
  points: { text: string; sources: number[] }[];
  /** After reading the other analysts */
  finalStance: Stance;
  finalScore: number;
  challenge: string;
  changedMind: string;
  failed?: boolean;
}

export interface ResearchResult {
  ticker: string;
  companyName: string;
  thesis: string;
  stance: Stance;
  confidence: "low" | "medium" | "high";
  /** 0-100, from the judge after the debate. Older results don't have it. */
  confidenceScore?: number;
  confidenceReason: string;
  bullPoints: string[];
  bearPoints: string[];
  whatWouldChangeMyMind: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Numbered: a citation [n] in any text refers to sources[n - 1] */
  sources: SourceRef[];
  revenue: { period: string; value: number }[];
  angles?: ResearchAngle[];
  agreements?: string[];
  disagreements?: string[];
  agents?: AgentStep[];
  /** The user's position when the research ran, if they own it */
  position?: { value: number; weight: number; pnlPct: number | null };
  /** What the agents said while working, for replay */
  transcript?: ResearchEvent[];
  /** "claude" = imported from a Claude Deep Research report the user pasted back */
  via?: "atlas" | "claude";
  /** The full Claude report, when imported */
  fullReport?: string;
  generatedAt: string;
}

/** One line in the live agent room while research runs. */
export interface ResearchEvent {
  ticker: string;
  /** "Business & market", "Judge", "Atlas", … */
  agent: string;
  phase: "status" | "reading" | "report" | "debate" | "changed_mind" | "verdict";
  text: string;
  stance?: Stance;
  score?: number;
  /** For "reading": what the agent is reading, or the pages it found by searching. For the first "status": the starting numbered list. */
  sources?: { n: number; title: string; url: string; publisher?: string }[];
  at: string;
}

export interface PaperBook {
  cash: number;
  positions: Record<string, { units: number; avgCost: number; name: string; lastPrice: number; kind?: string | null }>;
  seededFrom: "snaptrade" | "demo";
  seededAt: string;
}

export interface TradeRecord {
  id: string;
  mode: Mode;
  ticker: string;
  side: "BUY" | "SELL";
  dollars: number;
  units: number;
  price: number;
  status: string;
  brokerOrderId?: string;
  createdAt: string;
}

export interface Store {
  snaptradeUser: { userId: string; userSecret: string } | null;
  selectedAccountId: string | null;
  mode: Mode;
  interests: string[];
  /** Tickers the user follows without owning them */
  watchlist: string[];
  rules: Rule[];
  messages: ChatMessage[];
  paper: PaperBook | null;
  trades: TradeRecord[];
  seenSignals: string[];
  lastScanAt: string | null;
  daily: DailySchedule;
  memory: MemoryNote[];
}

/** The daily run: once a day Atlas looks at the portfolio, deep-researches part of it and posts a brief. */
export interface DailySchedule {
  /** Off until the user turns it on: every run spends API credit. */
  enabled: boolean;
  /** Local time of day, "HH:MM" (24h) */
  time: string;
  /** The time zone `time` is in, e.g. "America/Halifax": the browser's, saved with the schedule. Unset = the server's own zone. */
  timeZone?: string | null;
  /** How many stocks to deep-research per run (0-3). 0 = brief only. */
  depth: number;
  lastRunAt: string | null;
  /** Local day (YYYY-MM-DD) of the last scheduled run, so it runs once a day */
  lastRunDay: string | null;
  /** ISO time the run in progress started, or null */
  runningSince: string | null;
  /** Watch list memory: ticker -> when the daily run last deep-researched it. Rebuilt from the holdings on every run. */
  researchedAt: Record<string, string>;
  /** The portfolio at the previous run, to say what changed since */
  lastSnapshot: { at: string; total: number; prices: Record<string, number>; values: Record<string, number> } | null;
}

/** What the app needs to show the schedule (part of GET /api/state). */
export interface DailyState {
  enabled: boolean;
  time: string;
  depth: number;
  lastRunAt: string | null;
  /** ISO time of the next scheduled run, or null when off */
  nextRunAt: string | null;
  running: boolean;
  /** True on a host (Vercel) whose own once-a-day timer starts the run, instead of a clock inside Atlas */
  hostTimer?: boolean;
  /** The current watch list, in the order the daily run will research it */
  watch: { ticker: string; name: string; weight: number; lastResearchedAt: string | null }[];
}

/** The card a daily run posts. Its buy/sell suggestions follow as separate decision cards. */
export interface DailyBrief {
  /** Local date of the run, YYYY-MM-DD */
  day: string;
  trigger: "schedule" | "manual" | "claude";
  portfolio: {
    total: number;
    cash: number;
    source: Portfolio["source"];
    /** Change since the previous daily run; null on the first run */
    changeDollars: number | null;
    changePct: number | null;
    since: string | null;
  };
  /** Holdings, biggest move first. changePct is the price change since the previous run (0.02 = up 2%). */
  movers: { ticker: string; name: string; value: number; weight: number; changePct: number | null }[];
  /** Rule checks that tripped, in plain words */
  flags: string[];
  /** Deep research this run did */
  researched: { ticker: string; stance: Stance | null; confidenceScore: number | null; failed?: boolean }[];
  /** 2-4 plain sentences: what today means for this portfolio */
  summary: string;
  /** How many suggestion cards follow this brief */
  recommendations: number;
  nextRunAt: string | null;
}

/** One stock's exposure to a what-if scenario. Move percentages are fractions (-0.2 = falls 20%). */
export interface ScenarioHoldingImpact {
  ticker: string;
  name: string;
  value: number;
  /** share of the portfolio, 0..1 */
  weight: number;
  exposure: "high" | "medium" | "low" | "none";
  direction: "hurt" | "helped" | "mixed" | "unclear";
  /** rough plausible price move range if the scenario happens (model judgement, labelled as rough) */
  moveLowPct: number;
  moveHighPct: number;
  /** value × move, computed in code */
  dollarsLow: number;
  dollarsHigh: number;
  /** chain of cause → effect steps, e.g. ["Taiwan blockade", "TSMC can't ship chips", "NVIDIA can't make GPUs"] */
  path: string[];
  why: string;
}

export interface ScenarioChannel {
  name: string;
  mechanism: string;
  findings: string[];
}

export interface AgentStep {
  role: "planner" | "researcher" | "synthesizer" | "analyst" | "debater" | "judge";
  task: string;
  /** number of public sources this agent read */
  sourcesRead: number;
}

export type ScenarioAgentStep = AgentStep;

export interface ScenarioResult {
  scenario: string;
  headline: string;
  holdings: ScenarioHoldingImpact[];
  /** sums of dollarsLow/High across holdings (negative = loss); computed in code */
  portfolioImpact: { totalValue: number; dollarsLow: number; dollarsHigh: number; pctLow: number; pctHigh: number };
  channels: ScenarioChannel[];
  recommendation: string;
  confidence: "low" | "medium" | "high";
  confidenceReason: string;
  options: CardOption[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: SourceRef[];
  /** True when a [n] in the text means sources[n - 1]. Results saved before this carry numbers that match nothing. */
  numbered?: boolean;
  agents: ScenarioAgentStep[];
  generatedAt: string;
}

/** Where an Ideas session is, for the stage rail that shows while it runs. */
export type IdeaStage = "understanding" | "asking" | "scanning" | "checking" | "weighing" | "done";

/** One line in the live stage rail. A ticker with a status is a candidate being screened. */
export interface IdeaEvent {
  stage: IdeaStage;
  text: string;
  ticker?: string;
  status?: "candidate" | "kept" | "dropped";
}

export interface IdeaQuestion {
  text: string;
  /** Three or four short answers to tap. "You decide" is added by the page. */
  options: string[];
}

/** One suggestion. Every number is worked out in code from market data; the words come from the model. */
export interface IdeaSuggestion {
  ticker: string;
  name: string;
  kind: "stock" | "fund";
  /** The area it belongs to, e.g. "technology" or "broad market" */
  area: string;
  reason: string;
  whatItIs: string;
  risk: string;
  wrongIf: string;
  /** How it sits next to what the user already owns */
  fit: string;
  price: number;
  /** Price change over the last month and six months (0.05 = up 5%) */
  move1m: number | null;
  move6m: number | null;
  /** How far below its highest price of the year it is (0.1 = 10% below) */
  belowHigh: number;
  swings: "calm" | "moderate" | "bumpy";
  /** Dividends over the last year as a share of the price, null when it pays none */
  yield: number | null;
  /** Suggested paper amount */
  dollars: number;
  /** Share of the portfolio this would be after the suggested amount */
  weightAfter: number;
  /** Share of the portfolio already in the same area */
  areaNow: number;
  /** Share of the portfolio already in this very stock */
  heldNow: number;
  /** Set once the user put it in paper */
  trade?: { id: string; dollars: number; price: number; at: string };
}

export interface IdeaSession {
  prompt: string;
  /** asking: waiting for the answers to the questions. ready: the ideas (or the reason there are none) are in. */
  status: "asking" | "ready";
  questions: IdeaQuestion[];
  answers: string[];
  ideas: IdeaSuggestion[];
  /** Tickers that were looked at and set aside, with the plain reason */
  dropped: { ticker: string; why: string }[];
  /** One or two sentences: what was found, or why nothing was convincing */
  summary: string;
}

/** A rule as a sentence, for rules made in the app. */
export function ruleText(kind: RuleKind, threshold: number, ticker?: string): string {
  switch (kind) {
    case "concentration":
      return `Tell me if any single stock grows past ${threshold}% of my portfolio.`;
    case "drawdown":
      return `Tell me if any stock falls ${threshold}% or more below what I paid for it.`;
    case "idle_cash":
      return `Tell me if more than ${threshold}% of my portfolio is sitting in cash.`;
    case "price_below":
      return `Tell me if ${ticker} drops below $${threshold}.`;
    case "price_above":
      return `Tell me if ${ticker} goes above $${threshold}.`;
    case "news_watch":
      return "";
  }
}

/** Crypto and stablecoin symbols SnapTrade can return. These have no SEC filings, so stock research skips them. */
const NON_STOCK = new Set(["BTC", "ETH", "SOL", "USDC", "USDT", "DAI", "XRP", "ADA", "DOGE", "LTC", "BNB", "AVAX", "DOT", "MATIC", "LINK", "SHIB", "BCH", "XLM"]);
/** SPY and similar index funds have no company filings of their own either. */
const FUNDS = new Set(["SPY", "VOO", "IVV", "QQQ", "VTI", "DIA", "IWM"]);
/** US mutual fund symbols are five letters ending in X (FXAIX, VFIAX). */
const MUTUAL_FUND = /^[A-Z]{4}X$/;
/** True for a fund, which already holds many companies (index fund, ETF, mutual fund). */
export function isFund(ticker: string, kind?: string | null): boolean {
  if (kind) return kind === "etf" || kind === "mutualfund" || kind === "cef";
  const t = ticker.toUpperCase();
  return FUNDS.has(t) || MUTUAL_FUND.test(t);
}
/**
 * True for ordinary company stocks, the only holdings the filings-based research can handle.
 * The broker's own label decides when there is one; otherwise the symbol is checked against known funds and crypto.
 */
export function isResearchableStock(ticker: string, kind?: string | null): boolean {
  if (kind) return kind === "stock" || kind === "adr";
  const t = ticker.toUpperCase();
  return !NON_STOCK.has(t) && !FUNDS.has(t) && !MUTUAL_FUND.test(t);
}
