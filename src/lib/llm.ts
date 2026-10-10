import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// ATLAS_ANTHROPIC_API_KEY wins so a stale shell ANTHROPIC_API_KEY can't shadow the key in .env.local
// (Next.js never overrides variables that already exist in the environment).
export const anthropic = new Anthropic(
  // Deep research fires many Opus calls at once; retries ride out rate limits (429) with backoff.
  { maxRetries: 5, ...(process.env.ATLAS_ANTHROPIC_API_KEY ? { apiKey: process.env.ATLAS_ANTHROPIC_API_KEY } : {}) },
);

/**
 * Every API call is research, so all of it runs on Opus. Small triage calls pass effort "low".
 * Never used for arithmetic — thresholds, percentages and caps are plain code.
 */
export const MAIN_MODEL = "claude-opus-5-5";
/** Quick questions in the app are not research: the small model answers them for a fraction of a cent. */
export const CHAT_MODEL = "claude-haiku-5-5";

export class RefusalError extends Error {}

/**
 * Structured output with schema validation. Requests opt into server-side refusal
 * fallbacks ("default" routing) so a safety decline is retried on a suitable model.
 */
export async function structured<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  model?: string;
}): Promise<z.infer<S>> {
  const model = opts.model ?? MAIN_MODEL;
  const response = await anthropic.beta.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
    // The small model has no server-side refusal fallback.
    ...(model === MAIN_MODEL ? { betas: ["server-side-fallback-2026-07-01" as const], fallbacks: "default" as const } : {}),
  });
  if (response.stop_reason === "refusal") throw new RefusalError("The model declined this request.");
  if (response.parsed_output == null) throw new Error(`Model returned no parseable output (stop_reason: ${response.stop_reason}).`);
  return response.parsed_output as z.infer<S>;
}

export interface WebPage {
  url: string;
  title: string;
  /** YYYY-MM-DD when the search engine gave a readable page date, otherwise "" */
  date: string;
}

// A long searching turn can come back paused; this is how many times we send it back to carry on.
const MAX_CONTINUATIONS = 4;

function pageDate(age: string | null) {
  const d = age ? new Date(age) : null;
  if (!d || isNaN(d.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * Like structured(), but the model searches the web itself before answering. Also returns every page its
 * searches came back with, so the caller can check that a link the model cites really came from a search.
 */
export async function structuredWithSearch<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  maxSearches: number;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<{ output: z.infer<S>; pages: WebPage[]; searches: number }> {
  // The answer is parsed here, not by the SDK: only the last text block is the JSON.
  const { parse, ...format } = betaZodOutputFormat(opts.schema);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const pages = new Map<string, WebPage>();
  let searches = 0;

  for (let turn = 0; ; turn++) {
    // Streamed, because a searching turn can run for minutes.
    const response = await anthropic.beta.messages
      .stream({
        model: MAIN_MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        system: opts.system,
        messages,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: Math.max(1, opts.maxSearches - searches) }],
        output_config: { format, effort: opts.effort ?? "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();

    searches += response.usage.server_tool_use?.web_search_requests ?? 0;
    for (const block of response.content) {
      // A failed search carries an error object instead of a list of results.
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const r of block.content) {
        if (!pages.has(r.url)) pages.set(r.url, { url: r.url, title: r.title, date: pageDate(r.page_age) });
      }
    }

    if (response.stop_reason === "refusal") throw new RefusalError("The model declined this request.");
    if (response.stop_reason === "pause_turn" && turn < MAX_CONTINUATIONS) {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    let text: string | null = null;
    for (const block of response.content) if (block.type === "text") text = block.text;
    if (text == null) throw new Error(`Model returned no parseable output (stop_reason: ${response.stop_reason}).`);
    return { output: parse(text) as z.infer<S>, pages: [...pages.values()], searches };
  }
}
