import { z } from "zod";
import { paperAmount } from "./daily";
import { costOf, structured, type Usage } from "./llm";
import { latestPrice, marketFacts, type MarketFacts } from "./market";
import { paperPerformance, type TradeEffect } from "./paper";
import { paperPortfolio, priceFor } from "./portfolio";
import { evaluateRules } from "./rules";
import { addMessages, newMessage, readStore, updateStore } from "./store";
import { executeApprovedTrade } from "./trading";
import type { ChatMessage, IdeaEvent, IdeaQuestion, IdeaSession, IdeaSuggestion, Portfolio, Rule, TradeRecord } from "./types";

// The Ideas tab: a plain-words request, a few follow-up questions, then 3-5 grounded suggestions that can be
// tried on paper. The models do the wording only. A session makes at most three calls: the questions on the
// cheapest model, then the candidate list and the write-up on a stronger one, because those decide how good the
// ideas are. Everything else is code: each candidate is checked against real market data, every number shown
// comes from that data, and sizes and limits are plain arithmetic. Nothing here can place a live order.

const QUESTIONS_MODEL = "claude-haiku-5-5";
const PICKS_MODEL = "claude-sonnet-5-5";
// What one session may spend in all: the questions get a small slice, finding the ideas the rest.
const QUESTIONS_BUDGET_USD = 0.005;
const IDEAS_BUDGET_USD = 0.07;

const MAX_QUESTIONS = 4;
const MAX_CANDIDATES = 16;
const MAX_CHECKED = 12;
const MAX_IDEAS = 5;
const MAX_TEXT = 300;
const MAX_ANSWER = 200;
/** One new stock may be at most this share of the portfolio, a fund this much. The user's own concentration rule can lower it. */
const STOCK_SHARE = 0.05;
const FUND_SHARE = 0.15;
const DEFAULT_LIMIT = 0.25;
/** An area already this big a share of the portfolio counts as too close to what the user holds. */
const AREA_LIMIT = 0.4;

const AREAS = ["technology", "healthcare", "finance", "energy", "consumer", "industrial", "utilities", "real estate", "materials", "communication", "broad market", "bonds", "other"] as const;
/** Areas that are not a bet on one kind of business, so owning some doesn't crowd a new idea out. */
const SPREAD_AREAS: string[] = ["broad market", "bonds", "other"];

// ---------- The spending limit ----------

/** Adds up what a session's calls report and refuses a call whose worst case would go past the limit. */
export class Budget {
  spent = 0;
  constructor(readonly limit: number) {}

  track = (u: Usage) => {
    this.spent += costOf(u);
  };

  /** Whether a call with this much text going in and at most `maxTokens` coming out still fits. */
  allows(chars: number, maxTokens: number, model = QUESTIONS_MODEL): boolean {
    const worst = costOf({ model, input_tokens: Math.ceil(chars / 3), output_tokens: maxTokens });
    return this.spent + worst <= this.limit;
  }
}

export class BudgetError extends Error {
  constructor() {
    super("That request is bigger than Atlas takes on at once. Try asking it in a narrower way.");
  }
}

function ask<S extends z.ZodType>(
  budget: Budget,
  opts: { model: string; system: string; prompt: string; schema: S; maxTokens: number; effort: "low" | "medium" },
) {
  if (!budget.allows(opts.system.length + opts.prompt.length, opts.maxTokens, opts.model)) throw new BudgetError();
  return structured({ ...opts, track: budget.track });
}

// ---------- Words from the model, checked in code ----------

const MONEY_OR_PERCENT = /\$\s?\d|\d\s?(%|percent|per cent)|\b\d+x\b|\b\d[\d,.]*\s?(million|billion|trillion)\b/i;

/** The model is told not to write figures; a sentence that has one anyway is cut, so every number on the page is ours. */
export function cleanText(text: string, max = MAX_TEXT): string | null {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !MONEY_OR_PERCENT.test(sentence));
  // Whole sentences only: a long answer loses its last sentences, never half of one.
  let kept = "";
  for (const sentence of sentences) {
    if (`${kept} ${sentence}`.trim().length > max) break;
    kept = `${kept} ${sentence}`.trim();
  }
  if (!kept && sentences[0]) kept = `${sentences[0].slice(0, max).replace(/\s+\S*$/, "")}…`;
  return kept || null;
}

export const isTicker = (t: string) => /^[A-Z]{1,5}(\.[A-Z])?$/.test(t);

const oneLine = (p: Portfolio) => {
  const total = p.total || 1;
  const top = [...p.holdings]
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
    .map((h) => `${h.ticker} ${Math.round((h.value / total) * 100)}%`);
  return `${Math.round((p.cash / total) * 100)}% cash${top.length ? `; holds ${top.join(", ")}` : "; holds nothing yet"}`;
};

// ---------- Step 1: the follow-up questions ----------

const Clarify = z.object({
  questions: z.array(z.object({ text: z.string(), options: z.array(z.string()) })),
});

const CLARIFY_SYSTEM =
  "You help someone with no finance knowledge find investing ideas. They typed what they want. Decide which follow-up questions you need answered before suggesting anything. " +
  "Ask 3 or 4 short questions, fewer only when what they typed already settles some. Good topics: how long they could leave the money alone; how big a drop they could sit through without panicking; " +
  "how much they want to put in (always ask unless they said); what kinds of companies they want or want to avoid; whether to take what they already own into account. " +
  "Rules: everyday words only, no jargon (never use volatility, diversification, allocation, yield, exposure); a question is under 14 words; each question has 3 or 4 short answers to tap, each under 6 words, covering the likely cases; " +
  "never ask for a ticker; do not offer a 'you decide' answer, the app adds it.";

export function cleanQuestions(raw: z.infer<typeof Clarify>["questions"]): IdeaQuestion[] {
  return raw
    .map((q) => ({ text: q.text.trim().slice(0, 140), options: [...new Set(q.options.map((o) => o.trim().slice(0, 40)).filter(Boolean))].slice(0, 4) }))
    .filter((q) => q.text && q.options.length >= 2)
    .slice(0, MAX_QUESTIONS);
}

// ---------- Step 2: candidates, then the facts ----------

const Candidates = z.object({
  budgetUsd: z.number().nullable().describe("Dollars the person wants to invest: their number, or for a range or \"under X\" one number near the middle of it. Null if they gave nothing"),
  overlapMatters: z.boolean().describe("False only if the person said to ignore what they own or to add to it; otherwise true"),
  holdingAreas: z.array(z.object({ ticker: z.string(), area: z.enum(AREAS) })),
  candidates: z.array(z.object({ ticker: z.string(), area: z.enum(AREAS), angle: z.string().describe("Under 10 words: why it fits this person") })),
});

const CANDIDATES_SYSTEM =
  "You pick real US-listed stocks and ETFs worth a closer look for someone with no finance knowledge, from what they asked and answered. " +
  `Return 12 to ${MAX_CANDIDATES} candidates. Only tickers you are certain trade on NYSE or Nasdaq today. No penny stocks, crypto, leveraged or inverse funds, or newly listed companies. ` +
  "Follow their answers strictly: how long they can wait, how much of a drop they can take, what to prefer or avoid. For a cautious goal lean on broad funds and steady large companies; for a bold goal lean on focused companies. " +
  "Spread the list over several areas and mix low-cost funds with single companies, unless their answers clearly point one way, so the final picks can be balanced. " +
  "Favour well-run, established businesses and large, cheap funds over fashionable names; skip anything you would not be comfortable explaining to a beginner. " +
  "Give each candidate's area. Also give the area of each stock they already own.";

// ---------- Step 3: the write-up ----------

const WriteUp = z.object({
  ideas: z.array(z.object({ ticker: z.string(), reason: z.string(), whatItIs: z.string(), risk: z.string(), wrongIf: z.string(), fit: z.string() })),
  summary: z.string(),
});

const WRITE_UP_SYSTEM =
  "You write investing ideas for someone with no finance knowledge. Use only the candidates in the table: the app already checked them and shows every number itself. " +
  `Pick the 3 to ${MAX_IDEAS} that best fit what the person asked and answered. Pick fewer, or none, when few are convincing: an honest "nothing convincing" beats a weak idea. In that case leave ideas empty and say why in summary. ` +
  "Prefer ideas that do not pile onto what they already own (the table shows the overlap). " +
  "Before choosing, test every candidate against their answers: leave out one whose worst fall in the past year is clearly bigger than the drop they said they could sit through, " +
  "or whose swings don't suit how long they can wait. Spread the picks: at most two from the same area. For a beginner who wants something simple, include a broad low-cost fund as the base. " +
  "Each reason must tie to something they actually said. " +
  "For each idea write: reason (one sentence, specific to their answers, not generic), whatItIs (one plain sentence on what the company or fund is), risk (the main way it could lose money), " +
  "wrongIf (one concrete thing that would show the idea was wrong), fit (one sentence on how it sits next to what they own). " +
  "Rules: everyday words, explain any needed term in a few words. Never write a number, percentage or dollar amount. Do not mention the table or the app. Do not promise returns. summary is one or two sentences.";

const pct = (x: number) => `${Math.abs(Math.round(x * 100))}%`;
const moved = (x: number | null) => (x === null ? "n/a" : x >= 0 ? `up ${pct(x)}` : `down ${pct(x)}`);

function tableRow(f: MarketFacts, c: { area: string; angle: string }, heldNow: number, areaNow: number): string {
  return [
    f.ticker,
    f.name,
    f.kind,
    c.area,
    `1 month ${moved(f.move1m)}, 6 months ${moved(f.move6m)}, 1 year ${moved(f.move1y)}`,
    `worst fall in the past year ${pct(f.worstDrop)}`,
    `${pct(f.belowHigh)} below its yearly high`,
    `swings ${f.swings}`,
    f.yield ? `pays about ${pct(f.yield)} a year in dividends` : "no dividend",
    `they own ${pct(heldNow)}; same area ${pct(areaNow)}`,
    c.angle,
  ].join(" | ");
}

// ---------- Sizes and limits ----------

/** The user's own concentration limit when they have one, as a share of the portfolio. */
export const concentrationLimit = (rules: Rule[]) => (rules.find((r) => r.kind === "concentration")?.threshold ?? DEFAULT_LIMIT * 100) / 100;

const roundDown = (dollars: number) => (dollars >= 50 ? Math.floor(dollars / 5) * 5 : Math.floor(dollars));

/**
 * A paper amount for each idea, in order. The amount they said they'd invest is shared out evenly (or two
 * percent of the portfolio each when they gave none), then cut to what the paper cash allows and so that no
 * stock gets past the share limits. 0 means there is no room for that one.
 */
export function suggestAmounts(
  items: { ticker: string; kind: IdeaSuggestion["kind"] }[],
  p: Pick<Portfolio, "total" | "cash" | "holdings">,
  budget: number | null,
  limit: number,
): number[] {
  const total = p.total || 1;
  const each = budget && budget > 0 ? budget / items.length : paperAmount(total);
  let cash = p.cash;
  return items.map((item) => {
    const held = p.holdings.find((h) => h.ticker === item.ticker)?.value ?? 0;
    const share = item.kind === "fund" ? FUND_SHARE : Math.min(STOCK_SHARE, limit);
    const dollars = roundDown(Math.min(each, share * total - held, cash));
    if (!(dollars >= 1)) return 0;
    cash -= dollars;
    return dollars;
  });
}

export interface IdeaPreview {
  ticker: string;
  dollars: number;
  price: number;
  shares: number;
  cash: { before: number; after: number };
  /** The stock itself, as a share of the portfolio */
  stock: { before: number; after: number };
  /** The biggest single holding */
  biggest: { before: { ticker: string; share: number } | null; after: { ticker: string; share: number } | null };
  /** Other rules of the user's that this would newly trip, in plain words */
  flags: string[];
  /** Reasons the paper order can't be placed as asked; empty when it can */
  problems: string[];
  /** The most that can go in right now */
  maxDollars: number;
}

/** What the paper account looks like after buying `dollars` of a stock, and whether the safety limits allow it. Pure arithmetic. */
export function simulateBuy(
  p: Portfolio,
  rules: Rule[],
  buy: { ticker: string; name: string; kind: IdeaSuggestion["kind"]; price: number; dollars: number },
): IdeaPreview {
  const total = p.total || 1;
  const { ticker, dollars, price } = buy;
  const held = p.holdings.find((h) => h.ticker === ticker);
  const after: Portfolio = {
    ...p,
    cash: p.cash - dollars,
    holdings: held
      ? p.holdings.map((h) => (h.ticker === ticker ? { ...h, units: h.units + dollars / price, value: h.value + dollars } : h))
      : [...p.holdings, { ticker, name: buy.name, units: dollars / price, price, value: dollars, avgCost: price, pnlPct: 0, kind: buy.kind === "fund" ? "etf" : "stock" }],
  };
  const biggest = (x: Portfolio) => {
    const top = [...x.holdings].sort((a, b) => b.value - a.value)[0];
    return top ? { ticker: top.ticker, share: top.value / total } : null;
  };
  const limit = concentrationLimit(rules);
  const heldValue = held?.value ?? 0;
  const afterShare = (heldValue + dollars) / total;

  const problems: string[] = [];
  if (!(dollars >= 1) || !Number.isFinite(dollars)) problems.push("Enter an amount of at least $1.");
  else if (dollars > p.cash + 1e-9) problems.push(`You only have $${p.cash.toFixed(2)} of paper cash.`);
  if (buy.kind === "stock" && afterShare > limit + 1e-9) {
    problems.push(`That would make ${ticker} ${pct(afterShare)} of your portfolio, past your ${pct(limit)} limit for one stock.`);
  }

  // A cash warning is the same warning with a new percentage, so it is matched by its rule, not its title.
  const same = (h: ReturnType<typeof evaluateRules>[number]) => (h.rule.kind === "idle_cash" ? h.rule.id : h.message.title);
  const before = new Set(evaluateRules(p, rules).map(same));
  const flags = evaluateRules(after, rules)
    .filter((h) => h.rule.kind !== "concentration" && !before.has(same(h)))
    .map((h) => h.message.title ?? "");

  const room = buy.kind === "stock" ? limit * total - heldValue : Infinity;
  return {
    ticker,
    dollars,
    price,
    shares: dollars / price,
    cash: { before: p.cash / total, after: after.cash / total },
    stock: { before: heldValue / total, after: afterShare },
    biggest: { before: biggest(p), after: biggest(after) },
    flags,
    problems,
    maxDollars: Math.max(0, Math.floor(Math.min(p.cash, room))),
  };
}

// ---------- A session ----------

type Send = (event: IdeaEvent) => void;

const logLine = (id: string, label: string, budget: Budget) => console.log(`[ideas ${id.slice(0, 8)}${label}] ~$${budget.spent.toFixed(4)}`);

/** One Ideas session at a time per id, so a double click can't run it twice. */
const busy = new Set<string>();

async function ideasMessage(id: string): Promise<{ message: ChatMessage; session: IdeaSession }> {
  const message = (await readStore()).messages.find((m) => m.id === id && m.kind === "ideas");
  if (!message?.ideas) throw new Error("That ideas page no longer exists.");
  return { message, session: message.ideas };
}

/** Understands the request and asks the follow-up questions. With nothing to ask, goes straight on to the ideas. */
export async function startIdeas(prompt: string, send: Send): Promise<{ id: string }> {
  send({ stage: "understanding", text: "Reading what you asked" });
  const p = await paperPortfolio().catch(() => null);
  const budget = new Budget(QUESTIONS_BUDGET_USD);
  let questions: IdeaQuestion[] = [];
  try {
    const out = await ask(budget, {
      model: QUESTIONS_MODEL,
      system: CLARIFY_SYSTEM,
      prompt: `What they typed: "${prompt}"\nWhat they own: ${p ? oneLine(p) : "unknown"}`,
      schema: Clarify,
      maxTokens: 700,
      effort: "low",
    });
    questions = cleanQuestions(out.questions);
  } catch (e) {
    // Without questions the ideas are made from the request alone, which is better than stopping here.
    console.error("Ideas: the follow-up questions failed", e);
  }
  const session: IdeaSession = { prompt, status: "asking", questions, answers: [], ideas: [], dropped: [], summary: "" };
  const [message] = await addMessages(newMessage({ kind: "ideas", text: prompt, ideas: session }));
  logLine(message.id, " questions", budget);
  if (!questions.length) return findIdeas(message.id, [], send);
  send({ stage: "asking", text: `${questions.length} quick questions for you` });
  return { id: message.id };
}

/** Takes the answers and does the rest: candidates, checks, the write-up. */
export async function findIdeas(id: string, answers: string[], send: Send): Promise<{ id: string }> {
  if (busy.has(id)) throw new Error("Atlas is already working on this one.");
  busy.add(id);
  try {
    const { session } = await ideasMessage(id);
    if (session.status !== "asking") throw new Error("This one already has its ideas.");
    const given = session.questions.map((_, i) => String(answers[i] ?? "").trim().slice(0, MAX_ANSWER));
    const done = await work(session, given, send, id);
    await updateStore((s) => {
      const m = s.messages.find((x) => x.id === id);
      if (m) m.ideas = done;
    });
    send({ stage: "done", text: done.ideas.length ? `${done.ideas.length} ideas for you` : "Nothing convincing this time" });
    return { id };
  } finally {
    busy.delete(id);
  }
}

async function work(session: IdeaSession, answers: string[], send: Send, id: string): Promise<IdeaSession> {
  const [p, s] = await Promise.all([paperPortfolio(), readStore()]);
  const budget = new Budget(IDEAS_BUDGET_USD);
  const total = p.total || 1;
  const talk =
    `What they typed: "${session.prompt}"\n` +
    session.questions.map((q, i) => `Q: ${q.text}\nA: ${answers[i] || "no preference, you decide"}`).join("\n");

  send({ stage: "scanning", text: "Looking for candidates that fit your answers" });
  const found = await ask(budget, {
    model: PICKS_MODEL,
    system: CANDIDATES_SYSTEM,
    prompt: `${talk}\nWhat they own: ${oneLine(p)}`,
    schema: Candidates,
    maxTokens: 2500,
    effort: "medium",
  });
  const areaOf = new Map(found.holdingAreas.map((h) => [h.ticker.toUpperCase(), h.area as string]));
  const seen = new Set<string>();
  const candidates = found.candidates
    .map((c) => ({ ...c, ticker: c.ticker.trim().toUpperCase() }))
    .filter((c) => !seen.has(c.ticker) && seen.add(c.ticker))
    .slice(0, MAX_CANDIDATES);
  for (const c of candidates) send({ stage: "scanning", text: c.angle, ticker: c.ticker, status: "candidate" });

  send({ stage: "checking", text: "Checking the numbers" });
  const dropped: IdeaSession["dropped"] = [];
  let unreachable = 0;
  const drop = (ticker: string, why: string) => {
    dropped.push({ ticker, why });
    send({ stage: "checking", text: `Dropped: ${why}`, ticker, status: "dropped" });
    return null;
  };
  const checked = await Promise.all(
    candidates.map(async (c) => {
      if (!isTicker(c.ticker)) return drop(c.ticker, "not a valid ticker");
      const result = await marketFacts(c.ticker).catch(() => {
        unreachable++;
        return null;
      });
      if (!result) return drop(c.ticker, "market data didn't load");
      if ("why" in result) return drop(c.ticker, result.why);
      const heldNow = (p.holdings.find((h) => h.ticker === c.ticker)?.value ?? 0) / total;
      const areaNow = c.area === "other" ? 0 : sameArea(p, areaOf, c.area);
      if (found.overlapMatters && heldNow > 0) return drop(c.ticker, "you already own it");
      if (found.overlapMatters && !SPREAD_AREAS.includes(c.area) && areaNow >= AREA_LIMIT) return drop(c.ticker, "too close to what you hold");
      send({ stage: "checking", text: "Numbers check out", ticker: c.ticker, status: "kept" });
      return { facts: result.facts, c, heldNow, areaNow };
    }),
  );
  if (unreachable === candidates.length && candidates.length > 0) throw new Error("Atlas couldn't reach market data just now. Try again in a minute.");
  const kept = checked.filter((x) => x !== null).slice(0, MAX_CHECKED);

  let ideas: IdeaSuggestion[] = [];
  let summary = "None of the candidates held up against the real numbers, so there is nothing convincing to suggest this time.";
  if (kept.length) {
    send({ stage: "weighing", text: `Weighing the risks of ${kept.length} that passed` });
    try {
      const out = await ask(budget, {
        model: PICKS_MODEL,
        system: WRITE_UP_SYSTEM,
        prompt: `${talk}\nWhat they own: ${oneLine(p)}\n\nCandidates (ticker | name | type | area | recent moves | worst fall | vs yearly high | swings | dividends | overlap | why picked):\n${kept.map((k) => tableRow(k.facts, k.c, k.heldNow, k.areaNow)).join("\n")}`,
        schema: WriteUp,
        maxTokens: 3500,
        effort: "medium",
      });
      ideas = build(out.ideas, kept, p, s.rules, found.budgetUsd);
      summary = cleanText(out.summary, 450) ?? (ideas.length ? "Here is what stood out." : "Nothing here was convincing enough to suggest.");
    } catch (e) {
      console.error("Ideas: the write-up failed", e);
      summary = "Atlas checked the candidates but couldn't finish writing them up. Try again in a minute.";
    }
  }
  logLine(id, "", budget);
  return { ...session, status: "ready", answers, ideas, dropped, summary };
}

/** Share of the portfolio in holdings of the same area as `area`. */
function sameArea(p: Portfolio, areaOf: Map<string, string>, area: string): number {
  const total = p.total || 1;
  return p.holdings.filter((h) => areaOf.get(h.ticker.toUpperCase()) === area).reduce((sum, h) => sum + h.value, 0) / total;
}

type Kept = { facts: MarketFacts; c: { area: string; angle: string }; heldNow: number; areaNow: number };

/** The model's picks, kept only if they are in the checked table and every part of the explanation survived the check. */
export function build(
  picks: z.infer<typeof WriteUp>["ideas"],
  kept: Kept[],
  p: Pick<Portfolio, "total" | "cash" | "holdings">,
  rules: Rule[],
  budget: number | null,
): IdeaSuggestion[] {
  const byTicker = new Map(kept.map((k) => [k.facts.ticker, k]));
  const used = new Set<string>();
  const good: { k: Kept; words: Pick<IdeaSuggestion, "reason" | "whatItIs" | "risk" | "wrongIf" | "fit"> }[] = [];
  for (const pick of picks) {
    const k = byTicker.get(pick.ticker.trim().toUpperCase());
    if (!k || used.has(k.facts.ticker) || good.length >= MAX_IDEAS) continue;
    const reason = cleanText(pick.reason);
    const whatItIs = cleanText(pick.whatItIs);
    const risk = cleanText(pick.risk);
    const wrongIf = cleanText(pick.wrongIf);
    if (!reason || !whatItIs || !risk || !wrongIf) continue;
    used.add(k.facts.ticker);
    good.push({ k, words: { reason, whatItIs, risk, wrongIf, fit: cleanText(pick.fit) ?? "" } });
  }
  const total = p.total || 1;
  const amounts = suggestAmounts(good.map((g) => ({ ticker: g.k.facts.ticker, kind: g.k.facts.kind })), p, budget, concentrationLimit(rules));
  return good.map(({ k, words }, i) => ({
    ticker: k.facts.ticker,
    name: k.facts.name,
    kind: k.facts.kind,
    area: k.c.area,
    ...words,
    price: k.facts.price,
    move1m: k.facts.move1m,
    move6m: k.facts.move6m,
    belowHigh: k.facts.belowHigh,
    swings: k.facts.swings,
    yield: k.facts.yield,
    dollars: amounts[i],
    weightAfter: k.heldNow + amounts[i] / total,
    areaNow: k.areaNow,
    heldNow: k.heldNow,
  }));
}

// ---------- Trying an idea on paper ----------

/** The market price the idea was judged on; the broker's own quote only when that can't be had. */
const currentPrice = async (ticker: string) => (await latestPrice(ticker).catch(() => null)) ?? (await priceFor(ticker).catch(() => null));

async function inspect(id: string, ticker: string, dollars: number) {
  const { session } = await ideasMessage(id);
  const idea = session.ideas.find((i) => i.ticker === ticker);
  if (!idea) throw new Error("That idea isn't on this page.");
  const [p, s, live] = await Promise.all([paperPortfolio(), readStore(), currentPrice(ticker)]);
  const price = live ?? idea.price;
  return { idea, price, preview: simulateBuy(p, s.rules, { ticker, name: idea.name, kind: idea.kind, price, dollars }) };
}

/** What the portfolio would look like after the paper order. Nothing is saved. */
export async function previewIdea(id: string, ticker: string, dollars: number): Promise<IdeaPreview> {
  return (await inspect(id, ticker, dollars)).preview;
}

const placing = new Set<string>();

/** Checks the same limits again, then places the paper order and keeps it with the idea. Never a live order. */
export async function acceptIdea(id: string, ticker: string, dollars: number): Promise<TradeRecord> {
  const key = `${id}:${ticker}`;
  if (placing.has(key)) throw new Error("That order is already being placed.");
  placing.add(key);
  try {
    const amount = Math.round(dollars * 100) / 100;
    const { idea, price, preview } = await inspect(id, ticker, amount);
    if (idea.trade) throw new Error("This idea is already in your paper account.");
    if (preview.problems.length) throw new Error(preview.problems[0]);
    const trade = await executeApprovedTrade(ticker, "BUY", amount, { forcePaper: true, price });
    await updateStore((s) => {
      const target = s.messages.find((m) => m.id === id)?.ideas?.ideas.find((i) => i.ticker === ticker);
      if (target) target.trade = { id: trade.id, dollars: trade.dollars, price: trade.price, at: trade.createdAt };
      s.messages.push(
        newMessage({
          kind: "receipt",
          mode: "paper",
          origin: "Ideas",
          text: `Bought $${trade.dollars.toFixed(2)} of ${ticker} at about $${trade.price.toFixed(2)} per share (${trade.units.toFixed(4)} shares). Simulated: no real money moved.`,
        }),
      );
    });
    return trade;
  } finally {
    placing.delete(key);
  }
}

export interface TrackedIdea extends TradeEffect {
  messageId: string;
  name: string;
}

/** The ideas put in paper so far, with what each has gained or lost at today's price. */
export async function trackedIdeas(): Promise<{ tracked: TrackedIdea[]; total: number }> {
  const s = await readStore();
  const placed = s.messages.flatMap((m) => (m.kind === "ideas" ? (m.ideas?.ideas ?? []).filter((i) => i.trade).map((i) => ({ messageId: m.id, idea: i })) : []));
  const prices: Record<string, number> = {};
  await Promise.all(
    [...new Set(placed.map((x) => x.idea.ticker))].map(async (t) => {
      const price = await currentPrice(t);
      if (price) prices[t] = price;
    }),
  );
  const ids = new Set(placed.map((x) => x.idea.trade!.id));
  const performance = paperPerformance(s.trades.filter((t) => ids.has(t.id)), prices);
  const tracked = performance.trades.flatMap((effect) => {
    const from = placed.find((x) => x.idea.trade!.id === effect.id);
    return from ? [{ ...effect, messageId: from.messageId, name: from.idea.name }] : [];
  });
  return { tracked, total: performance.total };
}
