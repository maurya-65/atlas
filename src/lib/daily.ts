import { z } from "zod";
import { readStore, updateStore, newMessage, addMessages } from "./store";
import { activePortfolio, priceFor } from "./portfolio";
import { evaluateRules } from "./rules";
import { researchAndPost } from "./review";
import { claudeOption } from "./handoff";
import { structured } from "./llm";
import { isResearchableStock } from "./types";
import type { CardOption, ChatMessage, DailyBrief, DailySchedule, DailyState, Portfolio, ResearchEvent, ResearchResult } from "./types";

// The daily run: once a day, look at the portfolio, deep-research part of it, post a brief and a few
// paper-trade suggestions. All arithmetic is plain code; the model only words one short summary.
// Nothing here trades. A suggestion is a card, and a trade only happens when the user clicks it.

const STALE_RUN_MS = 30 * 60_000;
const WEEK_MS = 7 * 24 * 3600_000;
const MAX_SUGGESTIONS = 3;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

// ---------- Pure helpers (unit-checkable) ----------

/** Local calendar day, YYYY-MM-DD. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** A run that has been "running" for over 30 minutes is treated as dead. */
export function isRunning(schedule: DailySchedule, now: Date): boolean {
  return Boolean(schedule.runningSince) && now.getTime() - new Date(schedule.runningSince!).getTime() < STALE_RUN_MS;
}

/** Due: on, local time is at or past the set time, not run yet today, nothing running. */
export function isDue(schedule: DailySchedule, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (isRunning(schedule, now)) return false;
  if (schedule.lastRunDay === localDay(now)) return false;
  return now.getTime() >= atTime(now, schedule.time).getTime();
}

/** ISO time of the next scheduled run (local time), or null when off. A run that is already due returns `now`. */
export function nextRunAt(schedule: DailySchedule, now: Date): string | null {
  if (!schedule.enabled) return null;
  if (isDue(schedule, now)) return now.toISOString();
  const today = atTime(now, schedule.time);
  if (schedule.lastRunDay !== localDay(now) && now.getTime() < today.getTime()) return today.toISOString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return atTime(tomorrow, schedule.time).toISOString();
}

/** Current holdings in the order the daily run researches them: never researched first (biggest first), then longest ago. */
export function watchList(portfolio: Portfolio, schedule: DailySchedule) {
  const total = portfolio.total || 1;
  return portfolio.holdings
    .filter((h) => h.value > 0 && isResearchableStock(h.ticker))
    .map((h) => ({ ticker: h.ticker, name: h.name, weight: h.value / total, value: h.value, lastResearchedAt: schedule.researchedAt[h.ticker] ?? null }))
    .sort((a, b) => {
      if (!a.lastResearchedAt && !b.lastResearchedAt) return b.value - a.value;
      if (!a.lastResearchedAt) return -1;
      if (!b.lastResearchedAt) return 1;
      return a.lastResearchedAt.localeCompare(b.lastResearchedAt);
    })
    .map(({ ticker, name, weight, lastResearchedAt }) => ({ ticker, name, weight, lastResearchedAt }));
}

/** 2% of the portfolio, nearest $5, between $25 and $500. */
export function paperAmount(total: number): number {
  return Math.min(500, Math.max(25, Math.round((total * 0.02) / 5) * 5));
}

/** State for GET /api/state. */
export async function dailyState(): Promise<DailyState> {
  const s = await readStore();
  const now = new Date();
  let watch: DailyState["watch"] = [];
  try {
    watch = watchList(await activePortfolio(), s.daily);
  } catch {
    // portfolio unavailable: show the schedule without a watch list
  }
  const d = s.daily;
  return {
    enabled: d.enabled,
    time: d.time,
    depth: d.depth,
    lastRunAt: d.lastRunAt,
    nextRunAt: nextRunAt(d, now),
    running: isRunning(d, now),
    watch,
  };
}

// ---------- The run ----------

type Trigger = DailyBrief["trigger"];
interface Suggestion {
  ticker: string;
  name: string;
  side: "BUY" | "SELL";
  reason: string;
  research?: ResearchResult;
}

const firstSentence = (t: string) => t.match(/^.*?\.(\s|$)/)?.[0].trim() ?? t;
const shorten = (t: string, n: number) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "..." : t);

export async function runDaily(opts: { trigger: Trigger; onEvent?: (e: ResearchEvent) => void }): Promise<ChatMessage[]> {
  const now = new Date();
  const started = await updateStore((s) => {
    if (isRunning(s.daily, now)) return false;
    s.daily.runningSince = now.toISOString();
    return true;
  });
  if (!started) throw new Error("A daily run is already in progress. Give it a few minutes to finish.");
  try {
    return await run(opts, now);
  } finally {
    await updateStore((s) => {
      s.daily.runningSince = null;
    });
  }
}

async function run(opts: { trigger: Trigger; onEvent?: (e: ResearchEvent) => void }, now: Date): Promise<ChatMessage[]> {
  const origin = "Daily run";
  const posted: ChatMessage[] = [];
  const p = await activePortfolio();
  const store0 = await readStore();
  const sched = store0.daily;
  const total = p.total || 1;

  // b. What changed since the last run (plain arithmetic).
  const snap = sched.lastSnapshot;
  const changeDollars = snap ? p.total - snap.total : null;
  const changePct = snap && snap.total > 0 ? (p.total - snap.total) / snap.total : null;
  const movers = p.holdings
    .filter((h) => h.value > 0)
    .map((h) => {
      const before = snap?.prices[h.ticker];
      return { ticker: h.ticker, name: h.name, value: h.value, weight: h.value / total, changePct: before ? h.price / before - 1 : null };
    })
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0) || b.value - a.value);

  // c. Rule checks, in plain words (cards are not posted; the brief carries them).
  const hits = evaluateRules(p, store0.rules);
  const flags = hits.map((h) => (h.message.title ?? firstSentence(h.message.text)).replace(/[.]$/, ""));
  const needsSpreading = hits.some((h) => h.rule.kind === "concentration" || h.rule.kind === "idle_cash");

  // d. Deep research, one stock after another. One failure doesn't stop the run.
  const picks = watchList(p, sched).slice(0, Math.max(0, Math.min(3, sched.depth)));
  const researched: DailyBrief["researched"] = [];
  const researchedAt: Record<string, string> = {};
  for (const w of picks) {
    try {
      const m = await researchAndPost(w.ticker, {
        origin,
        onEvent: opts.onEvent,
        text: `**Daily run:** ${w.ticker} is ${(w.weight * 100).toFixed(1)}% of your portfolio and was next on your watch list.`,
      });
      posted.push(m);
      researchedAt[w.ticker] = new Date().toISOString();
      researched.push({ ticker: w.ticker, stance: m.research?.stance ?? null, confidenceScore: m.research?.confidenceScore ?? null });
    } catch (e) {
      console.error(`Daily run: research on ${w.ticker} failed`, e);
      researched.push({ ticker: w.ticker, stance: null, confidenceScore: null, failed: true });
    }
  }

  // e. Suggestions, in code.
  const store1 = await readStore();
  const paperCash = store1.paper?.cash ?? p.cash;
  const suggestions: Suggestion[] = [];
  const held = new Map(p.holdings.map((h) => [h.ticker, h]));
  const seen = new Set<string>();
  const recent = store1.messages
    .filter((m) => m.kind === "research" && m.research && now.getTime() - new Date(m.research.generatedAt).getTime() < WEEK_MS)
    .sort((a, b) => b.research!.generatedAt.localeCompare(a.research!.generatedAt));
  for (const m of recent) {
    const r = m.research!;
    if (seen.has(r.ticker)) continue;
    seen.add(r.ticker);
    if (!held.has(r.ticker)) continue;
    const side = r.stance === "consider_buying" ? "BUY" : r.stance === "consider_selling" ? "SELL" : null;
    if (!side) continue;
    suggestions.push({
      ticker: r.ticker,
      name: r.companyName,
      side,
      research: r,
      reason: `${shorten(r.thesis, 260)} Confidence: ${r.confidenceScore ?? "?"}/100.`,
    });
  }
  if (needsSpreading && paperCash > 0) {
    for (const t of ["VOO", "SPY"]) {
      if ((await priceFor(t).catch(() => null)) != null) {
        suggestions.push({
          ticker: t,
          name: t === "VOO" ? "Vanguard S&P 500 index fund" : "SPDR S&P 500 index fund",
          side: "BUY",
          reason:
            "Too much of your money is in one place (one big stock or a lot of idle cash). A broad index fund holds hundreds of US companies, so it spreads the risk instead of adding to one stock.",
        });
        break;
      }
    }
  }

  const amount = paperAmount(p.total);
  // Don't pile up the same suggestion while an earlier one is still waiting for an answer.
  const open = new Set(
    store1.messages
      .filter((m) => m.origin === origin && m.kind === "constraint" && !m.resolved)
      .flatMap((m) => (m.options ?? []).map((o) => `${o.payload?.side}:${o.payload?.ticker}`)),
  );
  const cards: ChatMessage[] = [];
  const used = new Set<string>();
  for (const sg of suggestions) {
    if (cards.length >= MAX_SUGGESTIONS) break;
    const key = `${sg.side}:${sg.ticker}`;
    if (used.has(key) || open.has(key)) continue;
    let cap = amount;
    if (sg.side === "BUY") cap = Math.min(amount, Math.floor(paperCash));
    else {
      const pos = store1.paper?.positions[sg.ticker];
      const value = pos ? pos.units * (held.get(sg.ticker)?.price ?? pos.lastPrice) : (held.get(sg.ticker)?.value ?? 0);
      cap = Math.min(amount, Math.floor(value));
    }
    if (!(cap >= 1)) continue;
    used.add(key);
    const verb = sg.side === "BUY" ? "buy" : "sell";
    const options: CardOption[] = [
      {
        label: `Try it in paper: ${verb} ${usd(cap)} of ${sg.ticker} (simulated)`,
        kind: "approve_trade",
        recommended: true,
        payload: { ticker: sg.ticker, side: sg.side, dollars: cap, paper: true },
      },
    ];
    if (sg.research) {
      options.push(
        claudeOption(
          { ticker: sg.ticker, name: sg.name, holding: held.get(sg.ticker), portfolioTotal: p.total, quick: sg.research },
          "Go deeper in Claude",
        ),
      );
    }
    options.push({ label: "Not now", kind: "dismiss" });
    cards.push(
      newMessage({
        kind: "constraint",
        origin,
        title: `Daily suggestion: ${verb} ${usd(cap)} of ${sg.ticker} in paper?`,
        text: sg.reason,
        recommendation: `Try this ${usd(cap)} ${verb} as a simulated trade first: no real money moves, and you can see how it would have gone.`,
        options,
      }),
    );
  }

  // f. One short summary, worded by the model (fallback in code).
  const dollarsText =
    changeDollars == null ? null : `${changeDollars >= 0 ? "up" : "down"} ${usd(Math.abs(changeDollars))} (${(Math.abs(changePct ?? 0) * 100).toFixed(1)}%) since the last daily run`;
  const verdicts = researched.map((r) =>
    r.failed ? `${r.ticker}: research didn't finish` : `${r.ticker}: ${r.stance?.replace(/_/g, " ")} (confidence ${r.confidenceScore ?? "?"}/100)`,
  );
  let summary =
    `Your portfolio is worth ${usd(p.total)}${dollarsText ? ` and is ${dollarsText}` : ""}. ` +
    (flags.length ? `${flags.length === 1 ? "One thing" : `${flags.length} things`} tripped your rules: ${flags.join("; ")}. ` : "Nothing tripped your rules. ") +
    (cards.length ? `I've added ${cards.length} suggestion${cards.length > 1 ? "s" : ""} you can try as simulated (paper) trades.` : "I have no suggestions today.");
  if (process.env.ATLAS_DAILY_NO_LLM !== "1") {
    try {
      const out = await structured({
        system:
          "You write a short daily note for someone with zero finance knowledge. 2 to 4 plain sentences, no jargon, calm, no urgency. Say what today's numbers, rule flags and research verdicts mean for this portfolio. Do not give advice beyond what the flags and verdicts already say. Do not invent numbers.",
        prompt: JSON.stringify({
          portfolioTotal: Math.round(p.total),
          cash: Math.round(p.cash),
          changeSinceLastRun: dollarsText,
          biggestMoves: movers
            .filter((m) => m.changePct != null)
            .slice(0, 3)
            .map((m) => `${m.ticker} ${(m.changePct! * 100).toFixed(1)}%`),
          ruleFlags: flags,
          researchVerdicts: verdicts,
          suggestionsPosted: cards.length,
        }),
        schema: z.object({ summary: z.string() }),
        effort: "low",
        maxTokens: 600,
      });
      if (out.summary.trim()) summary = out.summary.trim();
    } catch (e) {
      console.error("Daily run: summary call failed, using the built-in sentence", e);
    }
  }

  // g. Post the brief, then the suggestions.
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  const brief: DailyBrief = {
    day: localDay(now),
    trigger: opts.trigger,
    portfolio: { total: p.total, cash: p.cash, source: p.source, changeDollars, changePct, since: snap?.at ?? null },
    movers,
    flags,
    researched,
    summary,
    recommendations: cards.length,
    nextRunAt: sched.enabled ? atTime(next, sched.time).toISOString() : null,
  };
  posted.push(...(await addMessages(newMessage({ kind: "daily", text: summary, origin, daily: brief }), ...cards)));

  // h. Remember this run. Only held tickers stay in the watch list memory.
  await updateStore((s) => {
    const heldNow = new Set(p.holdings.map((h) => h.ticker));
    const merged = { ...s.daily.researchedAt, ...researchedAt };
    s.daily.researchedAt = Object.fromEntries(Object.entries(merged).filter(([t]) => heldNow.has(t)));
    s.daily.lastSnapshot = {
      at: now.toISOString(),
      total: p.total,
      prices: Object.fromEntries(p.holdings.map((h) => [h.ticker, h.price])),
      values: Object.fromEntries(p.holdings.map((h) => [h.ticker, h.value])),
    };
    s.daily.lastRunAt = now.toISOString();
    s.daily.lastRunDay = localDay(now);
  });
  return posted;
}
