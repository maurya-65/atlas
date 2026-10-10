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
export type ActionKind = "approve_trade" | "research" | "add_interest" | "dismiss" | "open_claude";

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

export type MessageKind = "user" | "agent" | "thought" | "constraint" | "research" | "receipt" | "scenario" | "daily";

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
  /** where the card came from, e.g. "Claude (via Atlas MCP)" */
  origin?: string;
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
  /** For "reading": what the agent is reading. For the first "status": the full numbered list. */
  sources?: { n: number; title: string; url: string; publisher?: string }[];
  at: string;
}

export interface PaperBook {
  cash: number;
  positions: Record<string, { units: number; avgCost: number; name: string; lastPrice: number }>;
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
  rules: Rule[];
  messages: ChatMessage[];
  paper: PaperBook | null;
  trades: TradeRecord[];
  seenSignals: string[];
  lastScanAt: string | null;
  daily: DailySchedule;
}

/** The daily run: once a day Atlas looks at the portfolio, deep-researches part of it and posts a brief. */
export interface DailySchedule {
  /** Off until the user turns it on: every run spends API credit. */
  enabled: boolean;
  /** Local time of day, "HH:MM" (24h) */
  time: string;
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
  agents: ScenarioAgentStep[];
  generatedAt: string;
}

/** Crypto and stablecoin symbols SnapTrade can return. These have no SEC filings, so stock research skips them. */
const NON_STOCK = new Set(["BTC", "ETH", "SOL", "USDC", "USDT", "DAI", "XRP", "ADA", "DOGE", "LTC", "BNB", "AVAX", "DOT", "MATIC", "LINK", "SHIB", "BCH", "XLM"]);
/** SPY and similar index funds have no company filings of their own either. */
const FUNDS = new Set(["SPY", "VOO", "IVV", "QQQ", "VTI", "DIA", "IWM"]);
/** True for ordinary company stocks (the only holdings the filings-based research can handle). */
export function isResearchableStock(ticker: string): boolean {
  const t = ticker.toUpperCase();
  return !NON_STOCK.has(t) && !FUNDS.has(t);
}
