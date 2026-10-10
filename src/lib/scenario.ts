import { z } from "zod";
import { structured } from "./llm";
import { dedupe, federalRegister, googleNews, secFilings, shortName, type SourceItem } from "./sources";
import { isResearchableStock } from "./types";
import type {
  CardOption,
  GraphEdge,
  GraphNode,
  Portfolio,
  ScenarioAgentStep,
  ScenarioChannel,
  ScenarioHoldingImpact,
  ScenarioResult,
  SourceRef,
} from "./types";

// What-if deep agent: a planner splits the scenario into causal channels, one fast researcher per channel
// reads public sources in parallel, and a synthesizer maps it onto the user's real holdings.
// All dollar maths happens in code; the model only gives rough move ranges and explanations.

const PLAIN =
  "The reader has no finance background. Use plain words, explain any term in half a sentence, no jargon. " +
  "Public information only. Be honest about uncertainty. Never invent an investment strategy: frame actions as 'worth considering, your call'.";

const MAX_HOLDINGS = 10;
const ITEMS_PER_CHANNEL = 8;
const MAX_SOURCES_FOR_SYNTH = 45;

const PlanSchema = z.object({
  keywords: z.string().describe("2-4 word search phrase capturing the scenario, e.g. 'Taiwan blockade'"),
  watchTopic: z.string().describe("Short topic to keep watching, e.g. 'Taiwan chip supply'"),
  channels: z
    .array(
      z.object({
        name: z.string().describe("e.g. 'Chip supply chain'"),
        mechanism: z.string().describe("One plain sentence: how the scenario travels through this channel"),
        queries: z.array(z.string()).describe("2-3 news search queries"),
        regulationTerm: z.string().describe("A 1-3 word term to search US government rules for, or empty string"),
      }),
    )
    .describe("3-5 causal channels"),
  exposedTickers: z.array(z.object({ ticker: z.string(), why: z.string() })).describe("Held tickers plausibly affected"),
});

const FindingsSchema = z.object({
  findings: z
    .array(z.object({ text: z.string().describe("One plain-English finding"), sources: z.array(z.number()).describe("Source numbers") }))
    .describe("2-4 key findings relevant to the scenario; empty if the sources say nothing useful"),
});

const NODE_TYPES = ["scenario", "channel", "company", "sector", "regulation", "labor", "event", "financials", "holding"] as const;

const SynthSchema = z.object({
  headline: z.string().describe("One plain sentence: what this scenario would mean for this portfolio"),
  holdings: z.array(
    z.object({
      ticker: z.string(),
      exposure: z.enum(["high", "medium", "low", "none"]),
      direction: z.enum(["hurt", "helped", "mixed", "unclear"]),
      moveLowPct: z.number().describe("Rough worst-case price move as a fraction, e.g. -0.3"),
      moveHighPct: z.number().describe("Rough best-case price move as a fraction, e.g. -0.05"),
      path: z.array(z.string()).describe("3-5 short cause-to-effect steps ending at this company"),
      why: z.string().describe("1-2 plain sentences"),
    }),
  ),
  channels: z.array(z.object({ name: z.string(), mechanism: z.string(), findings: z.array(z.string()) })),
  recommendation: z.string().describe("Honest plain-English recommendation; 'do nothing yet' is fine"),
  confidence: z.enum(["low", "medium", "high"]),
  confidenceReason: z.string(),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.enum(NODE_TYPES) })),
  edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string() })),
  citedSources: z.array(z.number()).describe("Source numbers actually used"),
});

interface HoldingCtx {
  ticker: string;
  name: string;
  value: number;
  weight: number;
  industry: string | null;
}

function clampMove(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-0.9, Math.min(0.9, x));
}

function numbered(items: SourceItem[]) {
  return items.map((s, i) => `[${i + 1}] ${s.title} (${s.publisher}${s.date ? `, ${s.date}` : ""})`).join("\n");
}

export async function runScenario(
  scenario: string,
  ctx: { portfolio: Portfolio; interests: string[]; onProgress?: (step: ScenarioAgentStep) => void },
): Promise<ScenarioResult> {
  const agents: ScenarioAgentStep[] = [];
  const log = (step: ScenarioAgentStep) => {
    agents.push(step);
    try {
      ctx.onProgress?.(step);
    } catch {
      // progress reporting must never break the run
    }
  };

  const total = ctx.portfolio.total || 1;
  const top = [...ctx.portfolio.holdings].sort((a, b) => b.value - a.value).slice(0, MAX_HOLDINGS);
  const industries = await Promise.all(top.map((h) => secFilings(h.ticker, 1).then((r) => r.industry).catch(() => null)));
  const holdings: HoldingCtx[] = top.map((h, i) => ({
    ticker: h.ticker,
    name: h.name || h.ticker,
    value: h.value,
    weight: h.value / total,
    industry: industries[i],
  }));
  const holdingsText = holdings.length
    ? holdings
        .map((h) => `${h.ticker} (${h.name}${h.industry ? `, industry: ${h.industry}` : ""}): ${(h.weight * 100).toFixed(1)}% of portfolio`)
        .join("\n")
    : "(no holdings — analyse which sectors would be affected instead)";

  // ---- 1. Planner ----
  let plan: z.infer<typeof PlanSchema>;
  try {
    plan = await structured({
      system: `You plan research for a "what if" question about a retail investor's portfolio. ${PLAIN}`,
      prompt:
        `Scenario: "${scenario}"\n\nHoldings:\n${holdingsText}\n\nInterests: ${ctx.interests.join(", ") || "(none)"}\n\n` +
        "Break the scenario into 3-5 distinct causal channels (e.g. supply chain, government/regulation, labor, consumer demand, interest rates/economy). " +
        "For each give the mechanism and 2-3 focused news search queries. Then list which held tickers are plausibly exposed and why.",
      schema: PlanSchema,
      maxTokens: 8000,
    });
  } catch {
    plan = {
      keywords: scenario.slice(0, 60),
      watchTopic: scenario.slice(0, 40),
      channels: [{ name: "General news", mechanism: "Direct news coverage of the scenario.", queries: [scenario.slice(0, 80)], regulationTerm: "" }],
      exposedTickers: holdings.slice(0, 3).map((h) => ({ ticker: h.ticker, why: "Large holding" })),
    };
  }
  const channels = plan.channels.slice(0, 5);
  log({ role: "planner", task: `Split "${scenario}" into ${channels.length} channels: ${channels.map((c) => c.name).join(", ")}`, sourcesRead: 0 });

  // ---- 2. Researchers (parallel) ----
  const heldSet = new Set(holdings.map((h) => h.ticker));
  const exposed = plan.exposedTickers.map((e) => e.ticker.toUpperCase()).filter((t) => heldSet.has(t)).slice(0, 6);

  const channelRuns = channels.map(async (ch) => {
    try {
      const fetched = await Promise.all([
        ...ch.queries.slice(0, 3).map((q) => googleNews(q, ch.name, 4)),
        ch.regulationTerm.trim() ? federalRegister(ch.regulationTerm.trim(), ch.name, 3) : Promise.resolve([]),
      ]);
      const items = dedupe(fetched.flat()).slice(0, ITEMS_PER_CHANNEL);
      let findings: { text: string; sourceItems: SourceItem[] }[] = [];
      if (items.length) {
        try {
          const out = await structured({
            system: `You are a research assistant. Extract only what the sources support. ${PLAIN}`,
            prompt:
              `Scenario: "${scenario}"\nChannel: ${ch.name} — ${ch.mechanism}\n\nSources:\n${numbered(items)}\n\n` +
              "List 2-4 key findings that matter for how this scenario would play out through this channel. Cite source numbers.",
            schema: FindingsSchema,
            maxTokens: 8000,
            effort: "low",
          });
          findings = out.findings.slice(0, 4).map((f) => ({
            text: f.text,
            sourceItems: f.sources.map((n) => items[n - 1]).filter(Boolean),
          }));
        } catch {
          // a failed researcher contributes its raw sources only
        }
      }
      log({ role: "researcher", task: `${ch.name}: ${ch.mechanism}`, sourcesRead: items.length });
      return { channel: ch, items, findings };
    } catch {
      log({ role: "researcher", task: `${ch.name}: no sources reachable`, sourcesRead: 0 });
      return { channel: ch, items: [] as SourceItem[], findings: [] as { text: string; sourceItems: SourceItem[] }[] };
    }
  });

  const holdingRuns = exposed.map(async (t) => {
    const h = holdings.find((x) => x.ticker === t)!;
    const items = await googleNews(`"${shortName(h.name)}" ${plan.keywords}`, t, 4).catch(() => [] as SourceItem[]);
    log({ role: "researcher", task: `${t}: news about ${shortName(h.name)} and ${plan.keywords}`, sourcesRead: items.length });
    return items;
  });

  const [channelResults, holdingItems] = await Promise.all([Promise.all(channelRuns), Promise.all(holdingRuns)]);

  // Global numbered source list: cited findings first, then the rest.
  const all = dedupe([
    ...channelResults.flatMap((r) => r.findings.flatMap((f) => f.sourceItems)),
    ...channelResults.flatMap((r) => r.items),
    ...holdingItems.flat(),
  ]).slice(0, MAX_SOURCES_FOR_SYNTH);
  const indexOf = new Map(all.map((s, i) => [s.url, i + 1]));

  const findingsText = channelResults
    .map((r) => {
      const lines = r.findings.map((f) => `- ${f.text} ${f.sourceItems.map((s) => `[${indexOf.get(s.url) ?? "?"}]`).join("")}`);
      return `## ${r.channel.name}\n${r.channel.mechanism}\n${lines.join("\n") || "- (no specific findings)"}`;
    })
    .join("\n\n");

  // ---- 3. Synthesizer ----
  let synth: z.infer<typeof SynthSchema> | null = null;
  try {
    synth = await structured({
      system: `You turn research into a clear what-if impact map for one retail investor. ${PLAIN} Move ranges are rough judgement, not predictions.`,
      prompt:
        `Scenario: "${scenario}"\n\nHoldings (ticker, name, share of portfolio):\n${holdingsText}\n\n` +
        `Research findings by channel:\n${findingsText}\n\nNumbered sources:\n${numbered(all) || "(none fetched)"}\n\n` +
        "For EVERY holding listed give exposure, direction, a rough price move range as fractions (low = worse case, high = better case; 0 and 0 if no exposure), " +
        "a 3-5 step cause-to-effect path, and a plain why. Write a one-sentence headline, an honest recommendation, confidence with reason, " +
        "and the channels with their key findings. Build a graph: a node with id \"scenario\" (type scenario) at the root, channel nodes (type channel), " +
        "company/sector/regulation/labor nodes in between, and one node per exposed holding (type holding, label = ticker, id = ticker). 10-20 nodes, short labels. " +
        "Cite source numbers you relied on.",
      schema: SynthSchema,
      maxTokens: 12000,
    });
  } catch {
    synth = null;
  }
  log({ role: "synthesizer", task: "Mapped the findings onto your holdings and estimated rough ranges", sourcesRead: all.length });

  // ---- 4. Code: numbers, graph validation, sources, options ----

  // The synthesizer cites the full numbered list. The card lists only the sources it used, so each [n] is
  // rewritten to that source's place in the card's list; a number that points at nothing is dropped.
  const written = synth
    ? [synth.headline, synth.recommendation, synth.confidenceReason, ...synth.holdings.map((x) => x.why), ...synth.channels.flatMap((c) => [c.mechanism, ...c.findings])]
    : [];
  const used = new Set(
    [...written.flatMap((t) => [...t.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1]))), ...(synth?.citedSources ?? [])].filter(
      (n) => Number.isInteger(n) && n >= 1 && n <= all.length,
    ),
  );
  const cited = all.filter((_, i) => used.has(i + 1));
  const place = new Map(all.flatMap((s, i) => (used.has(i + 1) ? [[i + 1, cited.indexOf(s) + 1] as const] : [])));
  const cite = (t: string) => t.replace(/\s?\[(\d+)\]/g, (m, n) => (place.has(Number(n)) ? m.replace(/\d+/, String(place.get(Number(n)))) : "")).trim();
  const noCites = (t: string) => t.replace(/\s?\[\d+\]/g, "").trim();

  const byTicker = new Map((synth?.holdings ?? []).map((h) => [h.ticker.toUpperCase(), h]));
  const impacts: ScenarioHoldingImpact[] = holdings.map((h) => {
    const s = byTicker.get(h.ticker);
    const exposure = s?.exposure ?? "none";
    let lo = exposure === "none" ? 0 : clampMove(s?.moveLowPct ?? 0);
    let hi = exposure === "none" ? 0 : clampMove(s?.moveHighPct ?? 0);
    if (lo > hi) [lo, hi] = [hi, lo];
    return {
      ticker: h.ticker,
      name: h.name,
      value: h.value,
      weight: h.weight,
      exposure,
      direction: s?.direction ?? "unclear",
      moveLowPct: lo,
      moveHighPct: hi,
      dollarsLow: h.value * lo,
      dollarsHigh: h.value * hi,
      path: (s?.path ?? []).slice(0, 5).map(noCites),
      why: s ? cite(s.why) : "I couldn't find a clear link between this scenario and this company.",
    };
  });
  const rank = { high: 3, medium: 2, low: 1, none: 0 } as const;
  impacts.sort((a, b) => rank[b.exposure] - rank[a.exposure] || a.dollarsLow - b.dollarsLow);

  const dollarsLow = impacts.reduce((s, x) => s + x.dollarsLow, 0);
  const dollarsHigh = impacts.reduce((s, x) => s + x.dollarsHigh, 0);
  const portfolioImpact = {
    totalValue: ctx.portfolio.total,
    dollarsLow,
    dollarsHigh,
    pctLow: dollarsLow / total,
    pctHigh: dollarsHigh / total,
  };

  const { nodes, edges } = validateGraph(scenario, synth?.nodes ?? [], synth?.edges ?? [], impacts, channels.map((c) => c.name));

  // Cited sources first (every one of them), then others worth a look, up to 20 in all.
  const orderedSources = [...cited, ...all.filter((_, i) => !used.has(i + 1))].slice(0, Math.max(20, cited.length));
  const sources: SourceRef[] = orderedSources.map((s) => ({ title: s.title, url: s.url, publisher: s.publisher, date: s.date }));

  const channelsOut: ScenarioChannel[] =
    synth?.channels?.length
      ? synth.channels.slice(0, 5).map((c) => ({ name: c.name, mechanism: cite(c.mechanism), findings: c.findings.slice(0, 4).map(cite) }))
      : channelResults.map((r) => ({ name: r.channel.name, mechanism: r.channel.mechanism, findings: r.findings.map((f) => f.text) }));

  const options: CardOption[] = [];
  const kindOf = new Map(ctx.portfolio.holdings.map((x) => [x.ticker, x.kind]));
  // Deeper research is only worth suggesting for a holding the scenario really reaches. When every link is
  // faint, the card recommends watching the topic instead.
  const mostExposed = impacts.find((x) => (x.exposure === "high" || x.exposure === "medium") && isResearchableStock(x.ticker, kindOf.get(x.ticker)));
  const mostHurt = impacts.find((x) => (x.direction === "hurt" || x.direction === "mixed") && x.exposure !== "none" && x.exposure !== "low");
  if (mostExposed) options.push({ label: `Research ${mostExposed.ticker} deeper`, kind: "research", recommended: true, payload: { ticker: mostExposed.ticker } });
  if (mostHurt && heldSet.has(mostHurt.ticker)) {
    options.push({ label: `Sell $25 of ${mostHurt.ticker}`, kind: "approve_trade", payload: { ticker: mostHurt.ticker, side: "SELL", dollars: 25 } });
  }
  options.push({ label: `Watch "${plan.watchTopic}"`, kind: "add_interest", recommended: options.length === 0, payload: { topic: plan.watchTopic } });
  options.push({ label: "Dismiss", kind: "dismiss" });

  const noHoldings = holdings.length === 0;
  return {
    scenario,
    headline:
      (synth ? cite(synth.headline) : null) ??
      (noHoldings
        ? "You don't hold any stocks yet, so this shows which kinds of companies would be affected."
        : "I gathered public sources but couldn't finish the analysis. Here's what I found."),
    holdings: impacts,
    portfolioImpact,
    channels: channelsOut,
    recommendation: synth ? cite(synth.recommendation) : "Not enough to act on. I'd keep watching this topic rather than trade on it.",
    confidence: synth?.confidence ?? "low",
    confidenceReason: synth ? cite(synth.confidenceReason) : "The analysis step didn't complete, so this is based on raw headlines only.",
    options,
    nodes,
    edges,
    sources,
    numbered: true,
    agents,
    generatedAt: new Date().toISOString(),
  };
}

function validateGraph(
  scenario: string,
  rawNodes: { id: string; label: string; type: (typeof NODE_TYPES)[number] }[],
  rawEdges: { source: string; target: string; label: string }[],
  impacts: ScenarioHoldingImpact[],
  channelNames: string[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  const add = (n: GraphNode) => {
    if (!n.id || ids.has(n.id)) return;
    ids.add(n.id);
    nodes.push(n);
  };
  add({ id: "scenario", label: scenario.length > 40 ? scenario.slice(0, 37) + "…" : scenario, type: "scenario" });
  for (const n of rawNodes.slice(0, 22)) add({ id: n.id, label: n.label.slice(0, 40), type: n.type });

  // Fallback skeleton when the model gave nothing useful.
  if (nodes.length < 3) {
    channelNames.forEach((c, i) => add({ id: `ch${i}`, label: c, type: "channel" }));
  }
  const exposedHoldings = impacts.filter((x) => x.exposure !== "none");
  for (const h of exposedHoldings) if (!ids.has(h.ticker)) add({ id: h.ticker, label: h.ticker, type: "holding" });

  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (e: GraphEdge) => {
    const k = `${e.source}->${e.target}`;
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target) || edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ ...e, label: e.label.slice(0, 40) });
  };
  for (const e of rawEdges) addEdge(e);

  // Link orphans to the scenario so the graph stays connected.
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
  for (const n of nodes) {
    if (n.id !== "scenario" && !connected.has(n.id)) addEdge({ source: "scenario", target: n.id, label: n.type === "holding" ? "affects" : "leads to" });
  }
  return { nodes, edges };
}
