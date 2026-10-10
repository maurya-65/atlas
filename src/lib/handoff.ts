import { z } from "zod";
import type { Holding, ResearchAngle, ResearchResult, SourceRef, Stance } from "./types";

// Hand-off to Claude Deep Research on claude.ai: the user's Claude plan pays for it, not Atlas's API key.
// Atlas opens claude.ai with a ready prompt; the user turns on Research mode and sends it. Claude ends its
// report with an ATLAS_RESULT JSON block, and the user pastes the answer back so Atlas can turn it into a
// card. Parsing is plain code: importing costs nothing.

const STANCES = ["consider_buying", "consider_selling", "hold_and_watch", "not_enough_info"] as const;

export interface HandoffContext {
  ticker: string;
  name?: string;
  holding?: Holding;
  portfolioTotal?: number;
  /** Why Atlas suggests this now, e.g. the news a scan flagged */
  reason?: string;
  signals?: SourceRef[];
  /** Atlas's own quick research, for Claude to check and go beyond */
  quick?: Pick<ResearchResult, "stance" | "confidenceScore" | "thesis">;
}

function positionLine(c: HandoffContext) {
  const h = c.holding;
  if (!h) return "I don't own it yet.";
  const weight = c.portfolioTotal ? ` (${((h.value / c.portfolioTotal) * 100).toFixed(1)}% of my portfolio)` : "";
  const pnl = h.pnlPct == null ? "" : `, ${h.pnlPct >= 0 ? "up" : "down"} ${Math.abs(h.pnlPct * 100).toFixed(1)}% from what I paid`;
  return `I own $${h.value.toFixed(0)} of it${weight}${pnl}.`;
}

export function buildClaudePrompt(c: HandoffContext): string {
  const t = c.ticker.toUpperCase();
  const lines = [
    "Please run a Deep Research on this stock for Atlas, my investing app. Take your time and read primary sources (SEC filings, company releases, government notices), not just headlines.",
    "",
    `Stock: ${c.name ? `${c.name} (${t})` : t}`,
    `My position: ${positionLine(c)}`,
  ];
  if (c.reason) lines.push(`Why now: ${c.reason}`);
  if (c.signals?.length) {
    lines.push("News Atlas flagged:");
    for (const s of c.signals.slice(0, 5)) lines.push(`- ${s.title}${s.publisher ? ` (${s.publisher}${s.date ? `, ${s.date}` : ""})` : ""} ${s.url}`);
  }
  if (c.quick) {
    lines.push(
      `Atlas's quick research said: ${c.quick.stance.replace(/_/g, " ")}, confidence ${c.quick.confidenceScore ?? "?"}/100. "${c.quick.thesis.slice(0, 400)}" Check whether that holds up.`,
    );
  }
  lines.push(
    "",
    "How to research:",
    "1. Work as 5 analysts, each on one angle: Business & market (revenue, profits, guidance, what the latest filings actually say), Regulation & legal, Industry & competition, People & operations, and a Skeptic who builds the strongest case against the others.",
    "2. Then a debate: each analyst challenges the weakest claim of another, with evidence, and says if anything changed their mind.",
    "3. A judge gives the verdict for MY position: buy more, sell some, or hold. Give a confidence score from 0 to 100 and say why.",
    "If you have the SnapTrade connector, first use it to read my actual holdings and use those numbers for my position.",
    "Write for someone with zero finance knowledge: plain words, short sections, and a link for every claim. Public information only. I make my own decisions; this is research, not personal financial advice.",
    "",
    "At the very end of your final report, add a line with exactly ATLAS_RESULT, then one JSON code block so Atlas can import it. In the JSON, cite sources as [n], where n is the source's position in the sources list starting at 1:",
    "```json",
    `{"ticker":"${t}","verdict":"consider_buying | consider_selling | hold_and_watch | not_enough_info","confidence":0,"summary":"3-5 sentences","bull":["..."],"bear":["..."],"angles":[{"name":"Business & market","stance":"hold_and_watch","score":0,"summary":"2-3 sentences"}],"agreements":["..."],"disagreements":["..."],"whatWouldChangeMyMind":"...","sources":[{"title":"...","url":"https://..."}]}`,
    "```",
  );
  return lines.join("\n");
}

export function claudeUrl(prompt: string) {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Link option for a card: open Claude Deep Research with the prompt filled in. */
export function claudeOption(c: HandoffContext, label = `Deep research ${c.ticker.toUpperCase()} in Claude (~10 min, free with Pro)`) {
  return { label, kind: "open_claude" as const, payload: { ticker: c.ticker.toUpperCase(), url: claudeUrl(buildClaudePrompt(c)) } };
}

// ---------- Import ----------

const loose = <T extends z.ZodTypeAny>(schema: T, fallback: z.infer<T>) => schema.catch(fallback);

/** A list where one malformed item becomes null (dropped later) instead of wiping the whole list. */
const list = <T extends z.ZodTypeAny>(item: T) => loose(z.array(item.nullable().catch(null)), []);

// The core fields are strict: the prompt's own template (verdict "a | b | c", no real sources) must not import.
const ImportSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z.\-]{1,10}$/),
  verdict: z.enum(STANCES),
  confidence: loose(z.number(), 0),
  summary: loose(z.string(), ""),
  bull: list(z.string()),
  bear: list(z.string()),
  angles: list(
    z.object({
      name: z.string(),
      stance: loose(z.enum(STANCES), "not_enough_info"),
      score: loose(z.number(), 0),
      summary: loose(z.string(), ""),
    }),
  ),
  agreements: list(z.string()),
  disagreements: list(z.string()),
  whatWouldChangeMyMind: loose(z.string(), ""),
  // Keep a broken source as a placeholder so the [n] numbers of the ones after it stay aligned.
  sources: z.array(
    z.object({ title: loose(z.string(), "Source"), url: loose(z.string(), "") }).catch({ title: "Source", url: "" }),
  ),
});

const present = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x != null);

/** A problem with the pasted answer, worded for the user. */
export class ImportError extends Error {}

/** The first balanced {...} after `from`, respecting JSON strings. */
function balancedObject(text: string, from: number): string | null {
  const start = text.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const clampScore = (n: number) => (Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0);

/** Turn a pasted Claude Deep Research answer into a research result. Throws a plain-words error if it can't. */
export function parseClaudeReport(pasted: string, expectedTicker?: string): ResearchResult {
  const marker = pasted.lastIndexOf("ATLAS_RESULT");
  if (marker < 0) throw new ImportError("I couldn't find the ATLAS_RESULT block. Copy Claude's whole answer, including the part at the very end.");
  const json = balancedObject(pasted, marker);
  if (!json) throw new ImportError("The ATLAS_RESULT block looks cut off. Copy Claude's whole answer again.");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ImportError("The ATLAS_RESULT block isn't valid JSON. Ask Claude to re-send just that block.");
  }
  const parsed = ImportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ImportError("The ATLAS_RESULT block needs a ticker, a real verdict and its sources. Copy Claude's final answer, not the prompt.");
  }
  const d = parsed.data;
  if (!d.sources.some((s) => /^https?:\/\//.test(s.url))) {
    throw new ImportError("The ATLAS_RESULT block has no sources. Copy Claude's final answer, not the prompt.");
  }
  if (expectedTicker && d.ticker !== expectedTicker.toUpperCase()) {
    throw new ImportError(`The ATLAS_RESULT block is about ${d.ticker}, not ${expectedTicker.toUpperCase()}.`);
  }

  // Keep every position so Claude's [n] numbers still line up; unsafe links lose their URL.
  const sources: SourceRef[] = d.sources.map((s) => {
    try {
      const u = new URL(s.url);
      if (u.protocol === "https:" || u.protocol === "http:") return { title: s.title, url: u.href, publisher: u.hostname.replace(/^www\./, "") };
    } catch {
      // not a URL
    }
    return { title: s.title, url: "" };
  });
  const cite = (s: string) => s.replace(/\s?\[(\d+)\]/g, (m, n) => (sources[Number(n) - 1]?.url ? m : "")).trim();
  const score = clampScore(d.confidence);
  const angles: ResearchAngle[] = present(d.angles).slice(0, 8).map((a) => ({
    name: a.name,
    focus: "",
    sourcesRead: 0,
    stance: a.stance as Stance,
    score: clampScore(a.score),
    report: cite(a.summary),
    points: [],
    finalStance: a.stance as Stance,
    finalScore: clampScore(a.score),
    challenge: "",
    changedMind: "",
  }));

  // The report itself, minus the machine block, for reading in full.
  // A report read from Claude's side panel can start with the panel's toolbar labels.
  const fullReport = pasted.slice(0, marker).trim().replace(/^CopyPublish\s*/, "");

  return {
    ticker: d.ticker,
    companyName: d.ticker,
    thesis: cite(d.summary),
    stance: d.verdict as Stance,
    confidence: score >= 70 ? "high" : score >= 45 ? "medium" : "low",
    confidenceScore: score,
    confidenceReason: `Claude Deep Research's own score for this verdict.`,
    bullPoints: present(d.bull).map(cite),
    bearPoints: present(d.bear).map(cite),
    whatWouldChangeMyMind: cite(d.whatWouldChangeMyMind),
    nodes: [],
    edges: [],
    sources,
    revenue: [],
    angles,
    agreements: present(d.agreements).map(cite),
    disagreements: present(d.disagreements).map(cite),
    via: "claude",
    fullReport: fullReport.slice(0, 60000),
    generatedAt: new Date().toISOString(),
  };
}
