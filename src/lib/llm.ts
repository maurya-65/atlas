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
}): Promise<z.infer<S>> {
  const response = await anthropic.beta.messages.parse({
    model: MAIN_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new RefusalError("The model declined this request.");
  if (response.parsed_output == null) throw new Error(`Model returned no parseable output (stop_reason: ${response.stop_reason}).`);
  return response.parsed_output as z.infer<S>;
}
