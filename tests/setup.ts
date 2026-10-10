// Imported first by every test file. Tests never touch the real store, a brokerage, or a paid API:
// state goes to a throwaway folder, SnapTrade keys are removed, and every network call is answered here.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.ATLAS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "atlas-test-"));
process.env.ATLAS_ANTHROPIC_API_KEY = "test-key";
process.env.ATLAS_DAILY_NO_LLM = "1";
for (const name of [
  "SNAPTRADE_CLIENT_ID",
  "SNAPTRADE_CONSUMER_KEY",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "ATLAS_PASSWORD",
  "CRON_SECRET",
  "VERCEL",
]) {
  delete process.env[name];
}

type Handler = (url: string) => Response | undefined | Promise<Response | undefined>;
let handler: Handler = () => undefined;

/** Answer outgoing requests. Anything the handler doesn't answer gets a 404, like an unreachable source. */
export function setFetch(next: Handler) {
  handler = next;
}

export const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

/** A price for every ticker, so paper trades can be simulated. */
export const yahooPrice =
  (price: number): Handler =>
  (url) =>
    url.includes("finance.yahoo.com") ? json({ chart: { result: [{ meta: { regularMarketPrice: price } }] } }) : undefined;

globalThis.fetch = (async (input: RequestInfo | URL) =>
  (await handler(String(input instanceof Request ? input.url : input))) ?? new Response("not found", { status: 404 })) as typeof fetch;

/** A JSON POST the way the Atlas page sends it. */
export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
