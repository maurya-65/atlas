import { z } from "zod";
import { structured } from "./llm";
import { dedupe, gatherCompany, gatherTopic, type CompanyBundle, type SourceItem } from "./sources";
import { newMessage } from "./store";
import { claudeOption } from "./handoff";
import type { CardOption, ChatMessage, Portfolio, Rule, SourceRef } from "./types";

const MAX_TICKERS = 6;
const CLASSIFY_BATCH = 25;
const MAX_MESSAGES = 4;
/** Biggest trade an option card may suggest. Mirrors the live per-trade cap. */
const SUGGESTED_TRADE_DOLLARS = 25;

const Classification = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      relevant: z.boolean(),
      category: z.enum(["labor", "regulation", "government", "earnings_revenue", "legal", "product", "macro", "other"]),
      direction: z.enum(["positive", "negative", "mixed", "neutral"]),
      importance: z.number().int().min(1).max(3),
      why: z.string(),
    }),
  ),
});
type Classified = SourceItem & Omit<z.infer<typeof Classification>["items"][number], "index">;

async function classify(items: SourceItem[], context: string): Promise<Classified[]> {
  const batches: SourceItem[][] = [];
  for (let i = 0; i < items.length; i += CLASSIFY_BATCH) batches.push(items.slice(i, i + CLASSIFY_BATCH));
  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const out = await structured({
          schema: Classification,
          maxTokens: 8000,
          effort: "low",
          system:
            "You triage public headlines for a retail investor. For each numbered item decide: is it actually about the named subject and " +
            "could it plausibly affect that company's or industry's business (relevant)? What kind of event is it (category)? Is it good or bad " +
            "for the subject (direction)? importance: 1 = routine/noise, 2 = worth a mention, 3 = material (strikes, new regulation, " +
            "investigations, big revenue surprises, guidance changes, major lawsuits). Generic market-wrap or listicle articles are importance 1. " +
            "why = one short plain-English sentence. Return one entry per item, using its index.",
          prompt:
            `${context}\n\nItems:\n` +
            batch.map((it, i) => `[${i}] (${it.subject}) ${it.kind.toUpperCase()} · ${it.publisher} · ${it.date}: ${it.title}`).join("\n"),
        });
        return out.items
          .filter((c) => c.index >= 0 && c.index < batch.length)
          .map(({ index, ...c }) => ({ ...batch[index], ...c }));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}

const CardSchema = z.object({
  messages: z.array(
    z.object({
      type: z.enum(["thought", "constraint"]),
      title: z.string(),
      text: z.string(),
      recommendation: z.string().nullable(),
      options: z.array(
        z.object({
          label: z.string(),
          kind: z.enum(["approve_trade", "research", "add_interest", "dismiss"]),
          recommended: z.boolean(),
          ticker: z.string().nullable(),
          side: z.enum(["BUY", "SELL"]).nullable(),
          topic: z.string().nullable(),
        }),
      ),
      sourceIndices: z.array(z.number().int()),
    }),
  ),
});

function money(n: number) {
  return Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`;
}

function revenueNote(b: CompanyBundle): string | null {
  const last = b.revenue[b.revenue.length - 1];
  if (!last) return null;
  const yoy = last.yoy == null ? "" : ` (${last.yoy >= 0 ? "up" : "down"} ${Math.abs(last.yoy * 100).toFixed(1)}% vs same quarter last year)`;
  return `${b.ticker} latest quarterly revenue ${last.period}: ${money(last.value)}${yoy}`;
}

function toRefs(items: SourceItem[]): SourceRef[] {
  return items.map((s) => ({ title: s.title, url: s.url, publisher: s.publisher, date: s.date }));
}

export async function runScan(input: {
  portfolio: Portfolio;
  interests: string[];
  rules: Rule[];
  seen: string[];
}): Promise<{ messages: ChatMessage[]; seenIds: string[] }> {
  const { portfolio, interests, rules } = input;
  const held = [...portfolio.holdings].sort((a, b) => b.value - a.value).slice(0, MAX_TICKERS);
  const topics = [
    ...new Set([...interests, ...rules.filter((r) => r.kind === "news_watch" && r.topic).map((r) => r.topic!)].map((t) => t.trim()).filter(Boolean)),
  ].slice(0, 6);

  const [bundles, topicItems] = await Promise.all([
    Promise.all(held.map((h) => gatherCompany(h.ticker, h.name))),
    Promise.all(topics.map((t) => gatherTopic(t))),
  ]);
  const all = dedupe([...bundles.flatMap((b) => b.items), ...topicItems.flat()]);
  const seen = new Set(input.seen);
  const fresh = all.filter((it) => !seen.has(it.id));
  const seenIds = all.map((it) => it.id);

  const checked = [...held.map((h) => h.ticker), ...topics].join(", ") || "nothing yet";
  const revenueNotes = bundles.map(revenueNote).filter(Boolean) as string[];
  const notableRevenue = bundles.filter((b) => {
    const last = b.revenue[b.revenue.length - 1];
    return last?.yoy != null && Math.abs(last.yoy) >= 0.1;
  });

  if (!held.length && !topics.length) {
    return {
      seenIds,
      messages: [
        newMessage({
          kind: "thought",
          text: "I don't have anything to watch yet. Connect a brokerage account or tell me which industries interest you, and I'll start checking news, SEC filings and government rules for them.",
        }),
      ],
    };
  }

  const classified = fresh.length
    ? await classify(fresh, `Subjects: ${held.map((h) => `${h.ticker} (${h.name})`).join(", ")}${topics.length ? `; topics: ${topics.join(", ")}` : ""}`)
    : [];
  const important = classified
    .filter((c) => c.relevant && c.importance >= 2)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 20);

  if (!important.length && !notableRevenue.length) {
    return {
      seenIds,
      messages: [
        newMessage({
          kind: "thought",
          text: `I checked ${fresh.length} new public items (news, SEC filings, government rules) for ${checked}. Nothing looks important enough to bother you with right now.`,
          sources: toRefs(fresh.slice(0, 5)),
        }),
      ],
    };
  }

  const positions = held
    .map((h) => {
      const weight = portfolio.total > 0 ? ((h.value / portfolio.total) * 100).toFixed(1) : "?";
      const pnl = h.pnlPct == null ? "unknown" : `${(h.pnlPct * 100).toFixed(1)}%`;
      return `- ${h.ticker} (${h.name}): $${h.value.toFixed(0)}, ${weight}% of portfolio, change since purchase ${pnl}`;
    })
    .join("\n");

  let cards: z.infer<typeof CardSchema>;
  try {
    cards = await structured({
      schema: CardSchema,
      system:
        "You are Atlas, a calm investing assistant for someone with zero finance knowledge. You turn already-triaged public signals into at most " +
        `${MAX_MESSAGES} chat messages.\n` +
        "- type 'thought' = worth knowing, no decision needed. Plain sentence starting like 'I noticed…'. options must be [].\n" +
        "- type 'constraint' = genuinely material for one of the user's holdings or interests, needs a decision. text explains what happened and why it matters for THIS user's position, in plain words, no jargon (explain any unavoidable term in brackets). recommendation is your plain-words suggestion, e.g. 'I'd hold for now and dig deeper before doing anything.'\n" +
        "- Constraint options: 2-4 real choices, the recommended one FIRST with recommended=true and only that one. Kinds: research (ticker), approve_trade (ticker + side; a small simulated/limited trade of $" +
        `${SUGGESTED_TRADE_DOLLARS}), add_interest (topic to keep watching), dismiss. Always include dismiss last.\n` +
        "- Core principle: you never pick a strategy on your own. Frame trades as 'could be worth considering — your call', never as instructions. Prefer research over trading when evidence is thin.\n" +
        "- Use only the numbered sources given; cite them by index in sourceIndices. Never invent facts, numbers or URLs.\n" +
        "- Group related items into one message. title is a short headline (max 8 words). Fewer, better messages beat many.",
      prompt:
        `User's holdings:\n${positions || "(none)"}\nCash: $${portfolio.cash.toFixed(0)} of $${portfolio.total.toFixed(0)} total.\n` +
        `Interests: ${topics.join(", ") || "(none)"}\n\n` +
        `Revenue from SEC filings:\n${revenueNotes.join("\n") || "(none)"}\n\n` +
        `Signals:\n` +
        important
          .map((c, i) => `[${i}] (${c.subject}) ${c.category}, ${c.direction}, importance ${c.importance} · ${c.publisher} ${c.date}: ${c.title} — ${c.why}`)
          .join("\n"),
    });
  } catch {
    // Fall back to a deterministic summary rather than failing the whole scan.
    return {
      seenIds,
      messages: important.slice(0, 3).map((c) =>
        newMessage({ kind: "thought", text: `I noticed: ${c.title} (${c.subject}). ${c.why}`, sources: toRefs([c]) }),
      ),
    };
  }

  const heldTickers = new Set(portfolio.holdings.map((h) => h.ticker));
  const messages = cards.messages.slice(0, MAX_MESSAGES).map((m) => {
    const sources = toRefs(m.sourceIndices.filter((i) => i >= 0 && i < important.length).map((i) => important[i]));
    if (m.type === "thought" || !m.options.length) {
      return newMessage({ kind: "thought", text: m.text, sources });
    }
    const options: CardOption[] = m.options
      .filter((o) => !(o.kind === "approve_trade" && (!o.ticker || !o.side)))
      // Can't sell what you don't own.
      .filter((o) => !(o.kind === "approve_trade" && o.side === "SELL" && !heldTickers.has(o.ticker!.toUpperCase())))
      .map((o) => {
        const base: CardOption = { label: o.label, kind: o.kind, recommended: o.recommended || undefined };
        if (o.kind === "approve_trade") base.payload = { ticker: o.ticker!.toUpperCase(), side: o.side!, dollars: SUGGESTED_TRADE_DOLLARS };
        else if (o.kind === "research") base.payload = { ticker: o.ticker?.toUpperCase() };
        else if (o.kind === "add_interest") base.payload = { topic: o.topic ?? undefined };
        return base;
      })
      .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended));
    // Material news about a stock: suggest the long Claude Deep Research (paid by the user's Claude plan).
    const researchTicker = options.find((o) => o.kind === "research")?.payload?.ticker;
    if (researchTicker) {
      const holding = portfolio.holdings.find((h) => h.ticker === researchTicker);
      const dismissAt = options.findIndex((o) => o.kind === "dismiss");
      const claude = claudeOption({
        ticker: researchTicker,
        name: holding?.name,
        holding,
        portfolioTotal: portfolio.total,
        reason: `${m.title}. ${m.text}`,
        signals: sources,
      });
      if (dismissAt >= 0) options.splice(dismissAt, 0, claude);
      else options.push(claude);
    }
    if (!options.some((o) => o.kind === "dismiss")) options.push({ label: "Dismiss", kind: "dismiss" });
    return newMessage({
      kind: "constraint",
      title: m.title,
      text: m.text,
      recommendation: m.recommendation ?? undefined,
      options,
      sources,
    });
  });

  return { seenIds, messages };
}
