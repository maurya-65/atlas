import { z } from "zod";
import { costOf, structured, structuredWithSearch, type Usage, type WebPage } from "./llm";
import {
  dedupe,
  federalRegister,
  gatherTopic,
  googleNews,
  lookupCompany,
  secFilings,
  secRevenue,
  shortName,
  stableId,
  type RevenuePoint,
  type SourceItem,
} from "./sources";
import type { AgentStep, GraphEdge, GraphNode, Holding, ResearchAngle, ResearchEvent, ResearchResult, Stance } from "./types";

// Deep research: nine analyst agents. Six start from the public sources Atlas collects for one angle (SEC
// filings, news feeds, Federal Register), search the web to read past the titles, and write a short cited
// report. Three are open: they get no source list and decide for themselves what to search each time. Then
// each reads the others' reports and argues back (one debate round). A judge weighs the debate into a verdict with a 0-100 confidence
// score. Every call is Opus; revenue growth and position size are computed in code, never by the model.
// Effort is medium for the analysts and the debate (research work scores the same as at high for less) and
// high for the one judge call that writes the verdict.

const ANALYST_EFFORT = "medium" as const;
const JUDGE_EFFORT = "high" as const;
const PER_ANGLE = 10;
const MAX_SOURCES = 90;
// Nine analysts search in parallel, so each gets fewer searches than a team of four would (the pages they read are most of the cost).
const SEARCHES_PER_ANALYST = 3;
// The open analysts have no source list to lean on, so they get more searches.
const SEARCHES_PER_OPEN_ANALYST = 5;
/** Pages from its own searches each analyst may cite */
const WEB_PER_ANALYST = 8;

const PLAIN =
  "The reader has no finance background. Use plain words, explain any term in half a sentence, no jargon. " +
  "Public information only. Never invent sources, numbers or events. Be honest about uncertainty: a scary headline " +
  "or a price drop is not by itself a reason to sell.";

const STANCES = ["consider_buying", "consider_selling", "hold_and_watch", "not_enough_info"] as const;

const STANCE_WORDS: Record<Stance, string> = {
  consider_buying: "consider buying (more)",
  consider_selling: "consider selling (some)",
  hold_and_watch: "hold and keep watching",
  not_enough_info: "not enough information",
};

interface Company {
  ticker: string;
  name: string;
  short: string;
  industry: string | null;
  filings: SourceItem[];
}

interface AngleDef {
  name: string;
  focus: string;
  fetch: (c: Company) => Promise<SourceItem[]>;
  /** No fixed sources: the analyst plans its own web searches */
  open?: boolean;
  /** Overrides the default search budget */
  searches?: number;
}

const news = (q: string, c: Company, n: number) => googleNews(q, c.ticker, n).catch(() => [] as SourceItem[]);
const rules = (term: string, c: Company, n: number) => federalRegister(term, c.ticker, n).catch(() => [] as SourceItem[]);

const ANGLES: AngleDef[] = [
  {
    name: "Business & market",
    focus: "How the business is doing: revenue trend, earnings, guidance, what its own SEC filings say, and how the stock market is reacting.",
    fetch: async (c) =>
      [
        ...c.filings,
        ...(await Promise.all([news(`"${c.short}" earnings revenue`, c, 5), news(`"${c.short}" stock`, c, 5)])).flat(),
      ],
  },
  {
    name: "Regulation & legal",
    focus: "Government rules, investigations, lawsuits, antitrust, export controls or tariffs that could help or hurt the company.",
    fetch: async (c) =>
      (
        await Promise.all([
          news(`"${c.short}" regulation OR lawsuit OR investigation OR antitrust`, c, 6),
          rules(c.short, c, 4),
          c.industry ? rules(c.industry, c, 3) : Promise.resolve([]),
        ])
      ).flat(),
  },
  {
    name: "Industry & competition",
    focus: "The company's industry: demand, rivals, market share, new technology and where the sector is heading.",
    fetch: async (c) =>
      (
        await Promise.all([
          news(`"${c.short}" competitors OR "market share"`, c, 5),
          c.industry ? gatherTopic(c.industry, 3).catch(() => [] as SourceItem[]) : Promise.resolve([]),
        ])
      ).flat(),
  },
  {
    name: "People & operations",
    focus: "Strikes, unions, layoffs, leadership changes, executives buying or selling their own shares, factories and supply chain problems.",
    fetch: async (c) =>
      (
        await Promise.all([
          news(`"${c.short}" strike OR union OR layoffs`, c, 5),
          news(`"${c.short}" CEO OR executive OR "supply chain"`, c, 4),
          news(`"${c.short}" "insider buying" OR "insider selling"`, c, 3),
        ])
      ).flat(),
  },
  {
    name: "Financial health",
    focus: "The balance sheet and cash: debt against cash, free cash flow, margins, dividends, buybacks and whether the company can fund itself.",
    fetch: async (c) =>
      [
        ...c.filings,
        ...(await Promise.all([
          news(`"${c.short}" debt OR "cash flow" OR "free cash flow" OR margins`, c, 5),
          news(`"${c.short}" dividend OR buyback OR "credit rating"`, c, 4),
        ])).flat(),
      ],
  },
  {
    name: "Valuation & expectations",
    focus: "What the market expects: analyst price targets and rating changes, how the valuation compares with rivals and its own history, and what is already priced in.",
    fetch: async (c) =>
      (
        await Promise.all([
          news(`"${c.short}" "price target" OR upgrade OR downgrade`, c, 6),
          news(`"${c.short}" valuation OR "P/E" OR "analyst expectations"`, c, 5),
        ])
      ).flat(),
  },
  {
    name: "News scout",
    open: true,
    focus:
      "What happened in the last few weeks that the fixed feeds can miss: breaking news, announcements, deals, outages, executive moves, and outside events (rates, tariffs, conflicts) that hit this company. Separate what is confirmed from rumour.",
    fetch: async () => [],
  },
  {
    name: "Skeptic",
    open: true,
    focus:
      "The strongest honest case against owning this stock: red flags, hidden risks, contradicting reports, short-seller or critic claims, and reasons the consensus could be wrong. Find evidence the other analysts are unlikely to look for.",
    fetch: async () => [],
  },
  {
    name: "Niche news",
    open: true,
    searches: 6,
    focus:
      "What sits below the headlines: trade and industry publications, supplier, customer and local news, court dockets, patents, job postings, conference transcripts, niche newsletters and forums. Go back months or years when older background explains what is happening now; do not stop at the latest news.",
    fetch: async () => [],
  },
];

const AnalystSchema = z.object({
  stance: z.enum(STANCES),
  score: z.number().describe("0-100: how confident you are in your stance, given how strong and recent the evidence is"),
  report: z
    .string()
    .describe("4-7 plain sentences from your angle only. Cite inline, one source per bracket: [n] for a numbered source, [W1] for a page in webSources."),
  points: z
    .array(
      z.object({
        text: z.string().describe("One short plain sentence"),
        sources: z.array(z.number()).describe("Numbered source numbers"),
        web: z.array(z.number()).describe("Positions in webSources (1 = [W1])"),
      }),
    )
    .describe("2-4 key points, each backed by at least one source"),
  webSources: z
    .array(z.object({ url: z.string().describe("Exactly as the search returned it"), title: z.string() }))
    .describe(`Pages from your own web searches that you cite, most important first, at most ${WEB_PER_ANALYST}. Empty if you cite none.`),
});

const DebateSchema = z.object({
  challenge: z
    .string()
    .describe("Your strongest objection to another analyst's view: name their angle, say why, cite [n]. Empty string if you agree with everyone."),
  changedMind: z.string().describe("What from the others changed your view, if anything. Empty string if nothing did."),
  stance: z.enum(STANCES),
  score: z.number().describe("0-100, your confidence after the debate"),
});

const NODE_TYPES = ["company", "event", "regulation", "labor", "financials", "source", "sector", "person"] as const;

const JudgeSchema = z.object({
  companyName: z.string(),
  stance: z.enum(STANCES),
  confidenceScore: z
    .number()
    .describe("0-100. High only when several independent, recent sources agree and the analysts mostly agree after debating."),
  confidenceReason: z.string().describe("One or two plain sentences, e.g. 'Medium: strong revenue data, but the legal risk is unresolved.'"),
  thesis: z.string().describe("3-5 plain sentences: what the evidence suggests for this investor. Cite [n]."),
  bullPoints: z.array(z.string()).describe("2-4 points in favour, each citing [n]"),
  bearPoints: z.array(z.string()).describe("2-4 points against, each citing [n]"),
  whatWouldChangeMyMind: z.string(),
  agreements: z.array(z.string()).describe("1-3 things the analysts agreed on"),
  disagreements: z.array(z.string()).describe("0-3 things they still disagree on, naming the angles"),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.enum(NODE_TYPES),
      sourceNumber: z.number().int().nullable().describe("For type 'source': its source number, otherwise null"),
    }),
  ),
  edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string() })),
});

function money(n: number) {
  return Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(0)}M`;
}

function clampScore(n: number) {
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0;
}

function scoreLabel(score: number): ResearchResult["confidence"] {
  return score >= 70 ? "high" : score >= 45 ? "medium" : "low";
}

/** Drop citations that don't point at a real source, so every [n] in the UI is a working link. */
function cleanCites(text: string, count: number) {
  return text.replace(/\s?\[(\d+)\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= count ? m : "")).trim();
}

/** Same page, however the link is written (www, trailing slash, #fragment). */
function urlKey(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url;
  }
}

/** Turn an analyst's own [W1] citations into numbers in the shared list. Ones with no number are dropped. */
function renumberWeb(text: string, numbers: Map<number, number>) {
  return text.replace(/\s?\[W(\d+)\]/gi, (m, k) => {
    const n = numbers.get(Number(k));
    return n ? m.replace(/W\d+/i, String(n)) : "";
  });
}

function numbered(items: { n: number; s: SourceItem }[]) {
  return items.map(({ n, s }) => `[${n}] ${s.kind.toUpperCase()} · ${s.publisher}${s.date ? ` · ${s.date}` : ""}: ${s.title}`).join("\n");
}

export interface ResearchContext {
  holding?: Holding;
  /** Portfolio total, to say how big the position is */
  portfolioTotal?: number;
  interests: string[];
  onProgress?: (step: AgentStep) => void;
  /** Live feed of what each agent is doing and saying */
  onEvent?: (e: ResearchEvent) => void;
}

export async function researchTicker(ticker: string, ctx: ResearchContext): Promise<ResearchResult> {
  const t = ticker.toUpperCase().trim();
  const agents: AgentStep[] = [];
  const log = (step: AgentStep) => {
    agents.push(step);
    try {
      ctx.onProgress?.(step);
    } catch {
      // progress reporting must never break the run
    }
  };

  // What the run cost, by stage, for the server log.
  const spend = { analysts: 0, debate: 0, judge: 0 };
  const trackFor = (stage: keyof typeof spend) => (u: Usage) => {
    spend[stage] += costOf(u);
  };

  const transcript: ResearchEvent[] = [];
  const say = (e: Omit<ResearchEvent, "ticker" | "at">) => {
    const ev: ResearchEvent = { ...e, ticker: t, at: new Date().toISOString() };
    transcript.push(ev);
    try {
      ctx.onEvent?.(ev);
    } catch {
      // a closed stream must never break the run
    }
  };
  say({ agent: "Atlas", phase: "status", text: `Collecting SEC filings, news and government notices about ${t}…` });

  // ---- 1. Gather sources per angle (code only) ----
  const [co, filings, revenue] = await Promise.all([
    lookupCompany(t).catch(() => null),
    secFilings(t, 5).catch(() => ({ items: [] as SourceItem[], industry: null })),
    secRevenue(t).catch(() => [] as RevenuePoint[]),
  ]);
  const name = co?.name ?? ctx.holding?.name ?? t;
  const company: Company = { ticker: t, name, short: shortName(name), industry: filings.industry, filings: filings.items };
  const perAngle = await Promise.all(ANGLES.map((a) => a.fetch(company).then((items) => dedupe(items).slice(0, PER_ANGLE))));

  // One numbered list across all angles so every agent cites the same numbers.
  const all = dedupe(perAngle.flat()).slice(0, MAX_SOURCES);
  const numberOf = new Map(all.map((s, i) => [urlKey(s.url), i + 1]));
  const angleSources = perAngle.map((items) =>
    items.flatMap((s) => (numberOf.has(urlKey(s.url)) ? [{ n: numberOf.get(urlKey(s.url))!, s }] : [])),
  );

  // Pages an analyst found by searching join the end of the same list. Only pages a search really returned
  // get a number, so a link the model made up can never become a source.
  const addWebSources = (cited: { url: string; title: string }[], pages: WebPage[]) => {
    const returned = new Map(pages.map((p) => [urlKey(p.url), p]));
    /** The analyst's W number -> number in the shared list */
    const numbers = new Map<number, number>();
    const web: { n: number; s: SourceItem }[] = [];
    cited.slice(0, WEB_PER_ANALYST).forEach((c, i) => {
      const page = returned.get(urlKey(c.url));
      if (!page) return;
      const key = urlKey(page.url);
      if (!numberOf.has(key)) {
        let publisher = "Web";
        try {
          publisher = new URL(page.url).hostname.replace(/^www\./, "");
        } catch {
          // keep the generic label
        }
        all.push({ id: stableId(page.url), title: page.title || c.title, url: page.url, publisher, date: page.date, kind: "web", subject: t, query: "web search" });
        numberOf.set(key, all.length);
      }
      const n = numberOf.get(key)!;
      numbers.set(i + 1, n);
      if (!web.some((w) => w.n === n)) web.push({ n, s: all[n - 1] });
    });
    return { numbers, web };
  };

  const fixedCount = ANGLES.filter((a) => !a.open).length;
  say({
    agent: "Atlas",
    phase: "status",
    text: `Found ${all.length} public sources. Handing them to ${fixedCount} analysts, one angle each; ${ANGLES.length - fixedCount} more search the news on their own. All of them can search the web.`,
    sources: all.map((s, i) => ({ n: i + 1, title: s.title, url: s.url, publisher: s.publisher })),
  });
  ANGLES.forEach((a, i) =>
    say({
      agent: a.name,
      phase: "reading",
      text: a.open ? `No fixed sources for me: I'll plan my own searches. My angle: ${a.focus}` : `Reading ${angleSources[i].length} sources and searching the web. My angle: ${a.focus}`,
      sources: angleSources[i].map(({ n, s }) => ({ n, title: s.title, url: s.url, publisher: s.publisher })),
    }),
  );

  const revenueText = revenue.length
    ? revenue
        .map((r) => `${r.period}: ${money(r.value)}${r.yoy == null ? "" : ` (${r.yoy >= 0 ? "+" : ""}${(r.yoy * 100).toFixed(1)}% vs a year earlier)`}`)
        .join("\n")
    : "(no quarterly revenue found in SEC data)";

  const h = ctx.holding;
  const weight = h && ctx.portfolioTotal ? h.value / ctx.portfolioTotal : null;
  const positionText = h
    ? `The user owns ${h.units} shares worth $${h.value.toFixed(0)}` +
      (weight != null ? `, ${(weight * 100).toFixed(1)}% of their portfolio` : "") +
      (h.pnlPct == null ? "" : `, ${(h.pnlPct * 100).toFixed(1)}% vs what they paid`) +
      ". Frame stances as: buy more, sell some, or hold."
    : "The user does not own this stock. Frame stances as: worth buying, avoid, or keep watching.";

  const header =
    `Today: ${new Date().toISOString().slice(0, 10)}\nCompany: ${name} (${t})${company.industry ? `, industry: ${company.industry}` : ""}\n${positionText}\n` +
    `User interests: ${ctx.interests.join(", ") || "(none)"}\n\nQuarterly revenue (SEC XBRL, computed in code):\n${revenueText}`;

  // ---- 2. Analysts, in parallel ----
  const round1 = await Promise.all(
    ANGLES.map(async (a, i) => {
      const src = angleSources[i];
      try {
        const { output, pages, searches } = await structuredWithSearch({
          system: a.open
            ? `You are the "${a.name}" analyst on a research team. Your angle: ${a.focus} ` +
              `You get no source list: you find your own. Search the web, up to ${a.searches ?? SEARCHES_PER_OPEN_ANALYST} times. Before each search, think about what is still ` +
              "unknown and what would move this stock right now, using the company, its industry, the user's position and interests. Use specific queries " +
              "(names, events, dates, rivals, regulators), not just the ticker. Follow up a lead with a sharper query instead of repeating one, and ignore stale " +
              "or off-topic pages. Prefer first-hand pages (company releases, filings, regulators, established news, trade press) and favour recent ones unless your angle needs older background. " +
              "Base every claim on pages your searches returned, never on memory. List the pages you rely on in webSources and cite them as [W1], [W2] by " +
              `their position in that list. If you find nothing solid, say so and pick not_enough_info with a low score. ${PLAIN}`
            : `You are the "${a.name}" analyst on a research team. Your angle: ${a.focus} ` +
              `You are given numbered sources (titles only) and revenue data. Search the web, up to ${SEARCHES_PER_ANALYST} times, to read what actually ` +
              "happened behind the titles that matter and to fill gaps in your angle. Prefer recent, first-hand pages: company releases, filings, " +
              "regulators, established news. Base every claim on the numbered sources, the revenue data or pages your searches returned, never on memory. " +
              "Cite numbered sources as [n]. List the web pages you rely on in webSources and cite them as [W1], [W2] by their position in that list. " +
              `If the evidence is still thin or off-topic, say so and pick not_enough_info with a low score. ${PLAIN}`,
          prompt: a.open
            ? `${header}\n\nYou have no numbered sources. Search for your angle yourself, then write your short report, key points, stance and confidence score.`
            : `${header}\n\nYour sources:\n${numbered(src) || "(none found)"}\n\nResearch your angle, then write your short report, key points, stance and confidence score.`,
          schema: AnalystSchema,
          maxSearches: a.searches ?? (a.open ? SEARCHES_PER_OPEN_ANALYST : SEARCHES_PER_ANALYST),
          maxTokens: 24000,
          effort: ANALYST_EFFORT,
          track: trackFor("analysts"),
        });
        const { numbers, web } = addWebSources(output.webSources, pages);
        const out = {
          stance: output.stance,
          score: output.score,
          report: renumberWeb(output.report, numbers),
          points: output.points.map((p) => ({
            text: renumberWeb(p.text, numbers),
            sources: [...p.sources, ...p.web.flatMap((k) => numbers.get(k) ?? [])],
          })),
        };
        const read = src.length + web.length;
        if (searches) {
          say({
            agent: a.name,
            phase: "reading",
            text: web.length
              ? `I searched the web ${searches} time${searches === 1 ? "" : "s"} and I'm citing ${web.length} page${web.length === 1 ? "" : "s"} I found.`
              : `I searched the web ${searches} time${searches === 1 ? "" : "s"} but found nothing better than the sources I was given.`,
            sources: web.map(({ n, s }) => ({ n, title: s.title, url: s.url, publisher: s.publisher })),
          });
        }
        log({ role: "analyst", task: `${a.name}: ${STANCE_WORDS[out.stance]}, ${clampScore(out.score)}/100`, sourcesRead: read });
        say({ agent: a.name, phase: "report", text: cleanCites(out.report, all.length), stance: out.stance, score: clampScore(out.score) });
        return { def: a, read, out, failed: false };
      } catch {
        log({ role: "analyst", task: `${a.name}: couldn't finish`, sourcesRead: src.length });
        say({ agent: a.name, phase: "status", text: "I couldn't finish my report, so my angle will be missing." });
        return { def: a, read: src.length, out: null, failed: true };
      }
    }),
  );

  const live = round1.filter((r) => r.out);
  const viewOf = (r: (typeof round1)[number]) =>
    `### ${r.def.name} analyst — ${STANCE_WORDS[r.out!.stance]}, confidence ${clampScore(r.out!.score)}/100\n${r.out!.report}`;
  const allSourcesText = numbered(all.map((s, i) => ({ n: i + 1, s })));

  // ---- 3. Debate: each analyst reads the others and pushes back ----
  // Every debater reads the same text (all the reports and all the sources), so that part comes first and is
  // cached: the first call writes it, the rest read it for a fraction of the price. The first debater therefore
  // runs alone, and the others start once it has finished.
  if (live.length >= 2) say({ agent: "Atlas", phase: "status", text: "Reports are in. Each analyst now reads the others and pushes back." });
  const sharedReading = `${header}\n\nAll sources:\n${allSourcesText}\n\nThe analysts' reports:\n${live.map(viewOf).join("\n\n")}`;
  const debate = async (r: (typeof round1)[number]) => {
    if (!r.out || live.length < 2) return null;
    try {
      const out = await structured({
        system:
          "You are an analyst in a research debate. Read the other analysts' reports, challenge the weakest claim you see " +
          `with evidence, and update your own stance only if their evidence is genuinely convincing. Don't just agree to be polite. ${PLAIN}`,
        sharedPrefix: sharedReading,
        prompt: `You are the "${r.def.name}" analyst. Your own report is the "${r.def.name}" one above; the rest belong to the other analysts.`,
        schema: DebateSchema,
        maxTokens: 16000,
        effort: ANALYST_EFFORT,
        track: trackFor("debate"),
      });
      log({ role: "debater", task: `${r.def.name}: ${out.changedMind.trim() ? "updated its view" : "held its view"}, now ${clampScore(out.score)}/100`, sourcesRead: 0 });
      if (out.challenge.trim()) say({ agent: r.def.name, phase: "debate", text: cleanCites(out.challenge, all.length) });
      say({
        agent: r.def.name,
        phase: "changed_mind",
        text: out.changedMind.trim() ? cleanCites(out.changedMind, all.length) : "Nothing the others said changed my view.",
        stance: out.stance,
        score: clampScore(out.score),
      });
      return out;
    } catch {
      return null;
    }
  };
  const first = round1.findIndex((r) => r.out);
  const round2: Awaited<ReturnType<typeof debate>>[] = round1.map(() => null);
  if (first >= 0) {
    round2[first] = await debate(round1[first]);
    const rest = await Promise.all(round1.map((r, i) => (i === first ? null : debate(r))));
    rest.forEach((out, i) => {
      if (i !== first) round2[i] = out;
    });
  }

  const angles: ResearchAngle[] = round1.map((r, i) => {
    const d = round2[i];
    if (!r.out) {
      return {
        name: r.def.name,
        focus: r.def.focus,
        sourcesRead: r.read,
        stance: "not_enough_info",
        score: 0,
        report: "This analyst couldn't finish, so its angle is missing from the verdict.",
        points: [],
        finalStance: "not_enough_info",
        finalScore: 0,
        challenge: "",
        changedMind: "",
        failed: true,
      };
    }
    return {
      name: r.def.name,
      focus: r.def.focus,
      sourcesRead: r.read,
      stance: r.out.stance,
      score: clampScore(r.out.score),
      report: cleanCites(r.out.report, all.length),
      points: r.out.points.slice(0, 4).map((p) => ({
        text: cleanCites(p.text, all.length),
        sources: p.sources.filter((n) => n >= 1 && n <= all.length),
      })),
      finalStance: d?.stance ?? r.out.stance,
      finalScore: clampScore(d?.score ?? r.out.score),
      challenge: cleanCites(d?.challenge ?? "", all.length),
      changedMind: cleanCites(d?.changedMind ?? "", all.length),
    };
  });

  // ---- 4. Judge ----
  const verdictInput = angles
    .filter((a) => !a.failed)
    .map(
      (a) =>
        `### ${a.name}\nBefore debate: ${STANCE_WORDS[a.stance]} (${a.score}/100)\n${a.report}\n` +
        `After debate: ${STANCE_WORDS[a.finalStance]} (${a.finalScore}/100)\n` +
        `Challenge: ${a.challenge || "(none)"}\nChanged mind: ${a.changedMind || "(no)"}`,
    )
    .join("\n\n");

  say({ agent: "Judge", phase: "status", text: "Weighing the reports and the debate…" });
  let judge: z.infer<typeof JudgeSchema> | null = null;
  try {
    judge = await structured({
      system:
        "You are the judge on a stock research team. Weigh the analysts' reports and their debate, then give one honest verdict for a " +
        "retail investor. Side with evidence, not with the majority. The stance is your read of the evidence; you never pick a " +
        `strategy for the user, they decide. ${PLAIN}\n` +
        "Graph: 10-18 nodes. Exactly one 'company' node with id 'company' at the center. Add event, regulation, labor, financials, sector " +
        "and person nodes for the facts that drove the verdict, and 'source' nodes (sourceNumber set, label = short publisher + topic) " +
        "linked to the facts they support. Short unique slug ids; edges have a 2-4 word label.",
      prompt: `${header}\n\nAnalyst reports and debate:\n${verdictInput || "(all analysts failed)"}\n\nAll sources:\n${allSourcesText}`,
      schema: JudgeSchema,
      maxTokens: 20000,
      effort: JUDGE_EFFORT,
      track: trackFor("judge"),
    });
  } catch {
    judge = null;
  }

  const ok = angles.filter((a) => !a.failed);
  const stance: Stance = judge?.stance ?? majorityStance(ok);
  const confidenceScore = judge ? clampScore(judge.confidenceScore) : Math.round(avg(ok.map((a) => a.finalScore)) * 0.6);
  const agreeing = ok.filter((a) => a.finalStance === stance).length;
  log({ role: "judge", task: `Verdict: ${STANCE_WORDS[stance]}, ${confidenceScore}/100 (${agreeing} of ${ok.length} analysts agree)`, sourcesRead: all.length });

  say({
    agent: "Judge",
    phase: "verdict",
    text: judge ? cleanCites(judge.thesis, all.length) : "The judge step didn't finish, so the verdict is the analysts' majority view.",
    stance,
    score: confidenceScore,
  });

  const total = spend.analysts + spend.debate + spend.judge;
  console.log(
    `[research ${t}] ~$${total.toFixed(2)} (analysts $${spend.analysts.toFixed(2)}, debate $${spend.debate.toFixed(2)}, judge $${spend.judge.toFixed(2)})`,
  );

  const { nodes, edges } = validateGraph(judge?.nodes ?? [], judge?.edges ?? [], all.length, company.short);
  const clean = (s: string) => cleanCites(s, all.length);

  return {
    ticker: t,
    // The judge sometimes appends the ticker; the card shows it separately.
    companyName: stripTicker(judge?.companyName || name, t) || name,
    thesis: judge
      ? clean(judge.thesis)
      : "The judge step didn't finish, so this verdict is the analysts' majority view. Read each analyst's report below.",
    stance,
    confidence: scoreLabel(confidenceScore),
    confidenceScore,
    confidenceReason: judge ? clean(judge.confidenceReason) : "Lowered because the judge step didn't complete.",
    bullPoints: (judge?.bullPoints ?? []).map(clean),
    bearPoints: (judge?.bearPoints ?? []).map(clean),
    whatWouldChangeMyMind: judge ? clean(judge.whatWouldChangeMyMind) : "",
    nodes,
    edges,
    sources: all.map((s) => ({ title: s.title, url: s.url, publisher: s.publisher, date: s.date })),
    revenue: revenue.map((r) => ({ period: r.period, value: r.value })),
    angles,
    agreements: (judge?.agreements ?? []).map(clean),
    disagreements: (judge?.disagreements ?? []).map(clean),
    agents,
    // The full source list already lives on the result; keep only the per-agent reading lists.
    transcript: transcript.map((e) => (e.agent === "Atlas" ? { ...e, sources: undefined } : e)),
    via: "atlas",
    position: h ? { value: h.value, weight: weight ?? 0, pnlPct: h.pnlPct } : undefined,
    generatedAt: new Date().toISOString(),
  };
}

function stripTicker(name: string, ticker: string) {
  const suffix = `(${ticker})`;
  const n = name.trim();
  return n.toUpperCase().endsWith(suffix) ? n.slice(0, -suffix.length).trim() : n;
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function majorityStance(angles: ResearchAngle[]): Stance {
  const counts = new Map<Stance, number>();
  for (const a of angles) counts.set(a.finalStance, (counts.get(a.finalStance) ?? 0) + 1);
  let best: Stance = "not_enough_info";
  let n = 0;
  for (const [s, c] of counts) if (c > n) [best, n] = [s, c];
  return best;
}

function validateGraph(
  rawNodes: z.infer<typeof JudgeSchema>["nodes"],
  rawEdges: z.infer<typeof JudgeSchema>["edges"],
  sourceCount: number,
  companyLabel: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  for (const n of rawNodes.slice(0, 20)) {
    if (!n.id || ids.has(n.id)) continue;
    if (n.type === "source" && (n.sourceNumber == null || n.sourceNumber < 1 || n.sourceNumber > sourceCount)) continue;
    ids.add(n.id);
    nodes.push({ id: n.id, label: n.label.slice(0, 40), type: n.type });
  }
  if (!ids.has("company")) {
    nodes.unshift({ id: "company", label: companyLabel, type: "company" });
    ids.add("company");
  }
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = rawEdges.filter((e) => {
    const key = `${e.source}->${e.target}`;
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target || edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  });
  // Keep the graph connected: attach orphan nodes to the company.
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  for (const n of nodes) {
    if (n.id !== "company" && !linked.has(n.id)) edges.push({ source: n.id, target: "company", label: "relates to" });
  }
  return { nodes, edges };
}
