import Anthropic from "@anthropic-ai/sdk";
import { snaptradeErrorText } from "./snaptrade";

export function errorText(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) return "The AI service is busy right now. Try again in a minute.";
  if (e instanceof Anthropic.AuthenticationError) return "The Anthropic API key is missing or invalid (set ATLAS_ANTHROPIC_API_KEY in .env.local).";
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status}). Try again.`;
  return snaptradeErrorText(e);
}

export function errorResponse(e: unknown) {
  console.error(e);
  return Response.json({ error: errorText(e) }, { status: 500 });
}

/**
 * Stream newline-delimited JSON while slow work runs: {type:"event"} lines as they happen, then one
 * {type:"done"} or {type:"error"} line. Lets the app show the agents working live.
 */
export function ndjsonStream(work: (send: (event: unknown) => void) => Promise<unknown>) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const write = (obj: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          open = false; // the browser went away; keep working so the result is still saved
        }
      };
      try {
        const result = await work((event) => write({ type: "event", event }));
        write({ type: "done", result });
      } catch (e) {
        console.error(e);
        write({ type: "error", error: errorText(e) });
      }
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
