/**
 * Atlas MCP server: plugs Atlas into Claude (Desktop / Code) next to SnapTrade's own connector.
 *
 * Claude gets Atlas's what-if deep agent, research, scan and rules as tools. It can PROPOSE trades,
 * but a proposal is only a decision card in the Atlas app: nothing executes until the human clicks
 * approve there, and live trades stay capped in server code. That's the seatbelt between an AI and
 * real money.
 *
 * Run: npm run mcp   (stdio transport)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

// Claude launches this from an arbitrary directory: use the project root so the shared
// store (.data/) and .env.local are the same ones the web app uses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(root);
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  // no .env.local; rely on the environment
}

// Imported after chdir/env so module-level config (SnapTrade keys, data dir) picks them up.
const { readStore, updateStore, addMessages, newMessage } = await import("../lib/store");
const { activePortfolio } = await import("../lib/portfolio");
const { runScenario } = await import("../lib/scenario");
const { researchAndPost, reviewPortfolio } = await import("../lib/review");
const { watchOnce } = await import("../lib/watch");
const { createTradeProposal } = await import("../lib/proposals");
const { runDaily, dailyState, setSchedule } = await import("../lib/daily");
const { LIVE_LIMITS, liveSpentToday } = await import("../lib/trading");
const { remember } = await import("../lib/chat");

const ORIGIN = "Claude (via Atlas MCP)";
const APP_URL = process.env.ATLAS_APP_URL ?? "http://localhost:3000";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

async function safe(fn: () => Promise<ReturnType<typeof text>>) {
  try {
    return await fn();
  } catch (e) {
    return { ...text(`Atlas error: ${(e as Error).message}`), isError: true };
  }
}

const server = new McpServer({ name: "atlas", version: "0.1.0" });

server.registerTool(
  "atlas_get_portfolio",
  {
    title: "Portfolio Atlas is watching",
    description:
      "Holdings, cash and total from the user's brokerage via SnapTrade (paper mode = simulated copy of the real account; live mode = the real account), plus the current mode and live trade limits.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    safe(async () => {
      const [p, s] = await Promise.all([activePortfolio(), readStore()]);
      return text({
        mode: s.mode,
        liveLimits: { ...LIVE_LIMITS, usedToday: await liveSpentToday() },
        portfolio: p,
      });
    }),
);

server.registerTool(
  "atlas_what_if",
  {
    title: "What-if deep agent",
    description:
      "Stress-test the user's real portfolio against a scenario (e.g. 'Taiwan blocks chip exports', 'Boeing workers strike', '50% tariffs on Chinese EVs'). Atlas runs a planner agent, parallel researcher agents over public news and Federal Register notices, and a synthesizer that maps the impact onto each holding with a rough dollar range and cause-and-effect path. Also posts a visual card with a graph in the Atlas app. Takes ~30-60s.",
    inputSchema: { scenario: z.string().min(3).max(500).describe("The scenario in plain words") },
  },
  async ({ scenario }) =>
    safe(async () => {
      const [p, s] = await Promise.all([activePortfolio(), readStore()]);
      const result = await runScenario(scenario, { portfolio: p, interests: s.interests });
      await addMessages(
        newMessage({ kind: "scenario", origin: ORIGIN, text: "", scenario: result, options: result.options, sources: result.sources }),
      );
      return text({
        headline: result.headline,
        portfolioImpact: result.portfolioImpact,
        holdings: result.holdings.map((h) => ({
          ticker: h.ticker,
          exposure: h.exposure,
          direction: h.direction,
          dollarRange: [h.dollarsLow, h.dollarsHigh],
          path: h.path.join(" -> "),
          why: h.why,
        })),
        recommendation: result.recommendation,
        confidence: `${result.confidence}: ${result.confidenceReason}`,
        agents: result.agents,
        sources: result.sources.slice(0, 12),
        note: `Graph and decision buttons are in the Atlas app: ${APP_URL}`,
      });
    }),
);

server.registerTool(
  "atlas_research_company",
  {
    title: "Deep research on a company",
    description:
      "Deep research on one stock from public sources (SEC filings, quarterly revenue, news, Federal Register). Four analyst agents each research one angle (business & market, regulation & legal, industry & competition, people & operations), search the web themselves for more, and write a short cited report, then debate each other; a judge gives the verdict (buy more / sell some / hold), a 0-100 confidence score with its reason, and points for and against. Citations [n] refer to sources[n-1]. The full card with buy/sell buttons is posted to the Atlas app. Takes a few minutes.",
    inputSchema: { ticker: z.string().min(1).max(10) },
  },
  async ({ ticker }) =>
    safe(async () => {
      const m = await researchAndPost(ticker.toUpperCase().trim(), { origin: ORIGIN });
      const r = m.research!;
      return text({
        ticker: r.ticker,
        companyName: r.companyName,
        verdict: r.stance,
        confidenceScore: r.confidenceScore,
        confidenceReason: r.confidenceReason,
        thesis: r.thesis,
        bullPoints: r.bullPoints,
        bearPoints: r.bearPoints,
        analysts: r.angles?.map((a) => ({ angle: a.name, stance: a.finalStance, score: a.finalScore, report: a.report, challenge: a.challenge })),
        agreements: r.agreements,
        disagreements: r.disagreements,
        whatWouldChangeMyMind: r.whatWouldChangeMyMind,
        sources: r.sources,
        note: `Full card with evidence graph and buy/sell buttons is in Atlas: ${APP_URL}`,
      });
    }),
);

server.registerTool(
  "atlas_review_portfolio",
  {
    title: "Deep-review the biggest holdings",
    description:
      "Run deep research (4 analyst agents, a debate round and a judge) on each of the user's 3 biggest holdings, one after another, and post a card per stock to the Atlas app. Returns each verdict (buy more / sell some / hold) with its 0-100 confidence score. Slow: several minutes.",
    inputSchema: {},
  },
  async () =>
    safe(async () => {
      const posted = await reviewPortfolio({ origin: ORIGIN });
      const verdicts = posted
        .filter((m) => m.research)
        .map((m) => ({
          ticker: m.research!.ticker,
          verdict: m.research!.stance,
          confidenceScore: m.research!.confidenceScore,
          thesis: m.research!.thesis,
          position: m.research!.position,
        }));
      return text({ verdicts, note: `Cards with sources and buy/sell buttons are in Atlas: ${APP_URL}` });
    }),
);

server.registerTool(
  "atlas_scan",
  {
    title: "Check rules and scan public sources",
    description:
      "Run Atlas's watch pass now: the user's saved rules (checked with plain arithmetic), plus SEC filings, news and government notices for holdings and interests. New findings are posted to the Atlas app as thoughts or decision cards.",
    inputSchema: {},
  },
  async () =>
    safe(async () => {
      const found = await watchOnce();
      return text(
        found.length
          ? found.map((m) => ({ kind: m.kind, title: m.title, text: m.text, recommendation: m.recommendation }))
          : "Nothing new since the last scan.",
      );
    }),
);

server.registerTool(
  "atlas_propose_trade",
  {
    title: "Propose a trade for human approval",
    description:
      `Create a decision card in the Atlas app proposing a small trade. This does NOT execute anything: the human must click approve in Atlas. In live mode, amounts are capped at $${LIVE_LIMITS.perTrade}/trade and $${LIVE_LIMITS.perDay}/day in server code, and larger requests are reduced. Only propose when the user asked for it.`,
    inputSchema: {
      ticker: z.string(),
      side: z.enum(["BUY", "SELL"]),
      dollars: z.number().positive(),
      title: z.string().describe("Short plain-English title, e.g. 'Sell $25 of NVDA?'"),
      reasoning: z.string().describe("Why, in plain words, including the main risk"),
      recommendation: z.string().describe("Honest recommendation, which may be to wait"),
    },
  },
  async (input) =>
    safe(async () => {
      const { summary } = await createTradeProposal(input, { origin: ORIGIN, save: true });
      return text(`${summary} Approve or decline at ${APP_URL}.`);
    }),
);

server.registerTool(
  "atlas_pending_decisions",
  {
    title: "Decision cards and what the user chose",
    description: "List recent decision cards in Atlas and whether the user approved, declined or hasn't answered yet. Also lists recent trades.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    safe(async () => {
      const s = await readStore();
      const cards = s.messages
        .filter((m) => m.options?.length)
        .slice(-10)
        .map((m) => ({ id: m.id, kind: m.kind, title: m.title ?? m.scenario?.scenario, origin: m.origin, status: m.resolved ? `user chose: ${m.resolved}` : "waiting for the user" }));
      return text({ cards, recentTrades: s.trades.slice(-10) });
    }),
);

server.registerTool(
  "atlas_rules",
  {
    title: "List, add or remove watch rules",
    description:
      "Manage the user's watch rules. Kinds: concentration (threshold = max % in one stock), drawdown (threshold = % below purchase price), idle_cash (threshold = max % cash), price_below / price_above (ticker + dollar threshold), news_watch (topic). action 'flag' = just tell; 'propose' = also suggest a small trade for approval.",
    inputSchema: {
      op: z.enum(["list", "add", "remove"]),
      kind: z.enum(["concentration", "drawdown", "idle_cash", "price_below", "price_above", "news_watch"]).optional(),
      text: z.string().optional().describe("Plain-English rule, as the user would say it"),
      threshold: z.number().optional(),
      ticker: z.string().optional(),
      topic: z.string().optional(),
      action: z.enum(["flag", "propose"]).optional(),
      id: z.string().optional().describe("Rule id, for remove"),
    },
  },
  async (input) =>
    safe(async () => {
      if (input.op === "add") {
        if (!input.kind || !input.text) throw new Error("kind and text are required to add a rule");
        await updateStore((s) => {
          s.rules.push({
            id: randomUUID(),
            kind: input.kind!,
            text: input.text!,
            threshold: input.threshold,
            ticker: input.ticker?.toUpperCase(),
            topic: input.topic,
            action: input.action ?? "flag",
            createdAt: new Date().toISOString(),
          });
        });
      } else if (input.op === "remove") {
        if (!input.id) throw new Error("id is required to remove a rule");
        await updateStore((s) => {
          s.rules = s.rules.filter((r) => r.id !== input.id);
        });
      }
      const s = await readStore();
      return text({ rules: s.rules, interests: s.interests });
    }),
);

server.registerTool(
  "atlas_daily_run",
  {
    title: "Run the daily check now",
    description:
      "Run Atlas's daily check: compare the portfolio with the last run, check the user's rules, deep-research the next stock(s) on the watch list (depth is set in the schedule; each costs API credit and takes about a minute), and post a daily brief plus up to 3 suggestion cards to the Atlas app. Suggestions are PAPER (simulated) trades the user accepts with one click. Nothing is traded by this tool.",
    inputSchema: {},
  },
  async () =>
    safe(async () => {
      const posted = await runDaily({ trigger: "claude" });
      const brief = posted.find((m) => m.kind === "daily")?.daily;
      const suggestions = posted.filter((m) => m.kind === "constraint").map((m) => ({ title: m.title, why: m.text }));
      return text({
        summary: brief?.summary,
        portfolio: brief?.portfolio,
        flags: brief?.flags,
        researched: brief?.researched,
        suggestions,
        note: `The brief and suggestion cards are in Atlas: ${APP_URL}. Suggestions are simulated (paper) trades the user must click to accept.`,
      });
    }),
);

server.registerTool(
  "atlas_daily_schedule",
  {
    title: "Get or set the daily run schedule",
    description:
      "Read or change when Atlas does its daily check. It is off by default because every run spends API credit. enabled turns it on/off, time is local 'HH:MM' (24h), depth is how many stocks to deep-research per run (0-3; 0 = brief only). Call with no arguments to just read it.",
    inputSchema: {
      enabled: z.boolean().optional(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      depth: z.number().int().min(0).max(3).optional(),
    },
  },
  async ({ enabled, time, depth }) =>
    safe(async () => {
      if (enabled !== undefined || time !== undefined || depth !== undefined) await setSchedule({ enabled, time, depth });
      return text(await dailyState());
    }),
);

server.registerTool(
  "atlas_memory",
  {
    title: "What Atlas remembers",
    description:
      "Notes from earlier conversations with this user: questions asked in the Atlas app and notes saved from Claude. Read it at the start of a conversation about their portfolio. After a discussion, or when the user states a preference or a decision, add one short sentence so the next conversation has context. Never store account numbers, passwords or keys.",
    inputSchema: {
      op: z.enum(["read", "add"]),
      note: z.string().max(400).optional().describe("For add: one sentence, e.g. 'Asked about selling NVDA; decided to wait for earnings.'"),
    },
  },
  async ({ op, note }) =>
    safe(async () => {
      if (op === "add") {
        if (!note?.trim()) throw new Error("note is required to add to memory");
        await remember(note, "claude");
      }
      return text({ notes: (await readStore()).memory });
    }),
);

await server.connect(new StdioServerTransport());
