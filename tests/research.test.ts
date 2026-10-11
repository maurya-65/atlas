import { json, setFetch } from "./setup";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { anthropic } from "../src/lib/llm";
import { researchTicker } from "../src/lib/research";

// The research pipeline with the model replaced: each test decides what the agents "say", so what is
// checked is what Atlas does with an answer. Nothing is sent or paid for.

const REAL = { type: "web_search_result", url: "https://investor.acme.example/q2-results", title: "Acme Q2 results", page_age: "October 2, 2026", encrypted_content: "" };

// Every analyst cites a given source, the page its search returned (written slightly differently),
// a page no search returned, and a source number that doesn't exist.
const analyst = {
  stance: "consider_buying",
  score: 70,
  report: "Sales grew 50% [1]. The company confirmed it [W1]. A rumour says otherwise [W2]. Nothing backs this [99].",
  points: [{ text: "Growth is confirmed [W1]", sources: [1], web: [1, 2] }],
  webSources: [
    { url: "https://www.investor.acme.example/q2-results/", title: "Acme Q2 results" },
    { url: "https://made-up.example/never-searched", title: "Invented" },
  ],
};
const debater = { challenge: "The lawsuit claim is thin [2]. See also [404].", changedMind: "", stance: "consider_buying", score: 66 };
const judge = {
  companyName: "Acme Corp. (ACME)",
  stance: "consider_buying",
  confidenceScore: 140,
  confidenceReason: "Strong sales data [1].",
  thesis: "Sales are growing fast [1]. One claim had no source [500].",
  bullPoints: ["Growth [1]"],
  bearPoints: ["A lawsuit [2]"],
  whatWouldChangeMyMind: "A guidance cut",
  agreements: [],
  disagreements: [],
  nodes: [],
  edges: [],
};

let calls: { system: string; searched: boolean; model: string; fallbacks?: unknown; content?: unknown }[] = [];

beforeEach(() => {
  calls = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replacing SDK methods with test doubles
  const messages = anthropic.beta.messages as any;
  messages.parse = async ({ system, model, fallbacks, messages: sent }: { system: string; model: string; fallbacks?: unknown; messages: { content: unknown }[] }) => {
    calls.push({ system, model, fallbacks, searched: false, content: sent[0].content });
    return { stop_reason: "end_turn", parsed_output: system.includes("research debate") ? debater : judge };
  };
  messages.stream = ({ system, model, fallbacks }: { system: string; model: string; fallbacks?: unknown }) => ({
    finalMessage: async () => {
      calls.push({ system, model, fallbacks, searched: true });
      return {
        stop_reason: "end_turn",
        usage: { server_tool_use: { web_search_requests: 2 } },
        content: [
          { type: "web_search_tool_result", tool_use_id: "t", content: [REAL] },
          { type: "text", text: JSON.stringify(analyst) },
        ],
      };
    },
  });

  // Public sources, as the three feeds would return them.
  setFetch((url) => {
    if (url.includes("company_tickers.json")) return json({ 0: { cik_str: 1, ticker: "ACME", title: "Acme Corp." } });
    if (url.includes("/submissions/")) {
      return json({ filings: { recent: { accessionNumber: ["0000-26-000001"], filingDate: ["2026-09-30"], form: ["10-Q"], primaryDocument: ["q.htm"] } } });
    }
    if (url.includes("news.google.com")) {
      return new Response(
        "<rss><channel><item><title>Acme sued over widgets - Newswire</title><link>https://news.google.com/rss/articles/1</link><source>Newswire</source></item></channel></rss>",
      );
    }
    return undefined;
  });
});

test("nine analysts search, debate once, and a judge gives one verdict", async () => {
  const r = await researchTicker("acme", { interests: [] });
  assert.equal(r.stance, "consider_buying");
  assert.equal(r.confidenceScore, 100, "a score outside 0-100 is clamped");
  assert.equal(r.angles?.length, 9);
  assert.equal(calls.length, 19);
  assert.equal(calls.filter((c) => c.searched).length, 9, "only the analysts search the web");
  assert.equal(calls.filter((c) => c.searched && c.system.includes("no source list")).length, 3, "three analysts plan their own searches; the other six start from the collected sources");
  assert.ok(calls[18].system.includes("You are the judge"));
});

test("every citation in the card points at a real source", async () => {
  const r = await researchTicker("ACME", { interests: [] });
  const text = [r.thesis, r.confidenceReason, ...r.bullPoints, ...r.bearPoints, ...r.angles!.flatMap((a) => [a.report, a.challenge, ...a.points.map((p) => p.text)])].join("\n");
  const cited = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  assert.ok(cited.length > 0);
  for (const n of cited) assert.ok(r.sources[n - 1]?.url, `[${n}] has a source`);
  assert.equal(r.thesis, "Sales are growing fast [1]. One claim had no source.");
});

test("a page an analyst found joins the source list once; a made-up link never does", async () => {
  const r = await researchTicker("ACME", { interests: [] });
  assert.equal(r.sources.filter((s) => s.url === REAL.url).length, 1, "nine analysts citing the same page add it once");
  assert.equal(r.sources.some((s) => s.url.includes("made-up.example")), false);

  const n = r.sources.findIndex((s) => s.url === REAL.url) + 1;
  for (const a of r.angles!) {
    assert.ok(a.report.includes(`The company confirmed it [${n}].`), "[W1] became the shared number");
    assert.ok(a.report.includes("A rumour says otherwise."), "the citation of the invented page is dropped");
    assert.deepEqual(a.points[0].sources, [1, n]);
  }
  assert.doesNotMatch(JSON.stringify(r), /\[W\d+\]/i);
});

test("the debaters read the same cached text, so only the first one pays full price for it", async () => {
  await researchTicker("ACME", { interests: [] });
  const debates = calls.filter((c) => c.system.includes("research debate"));
  assert.equal(debates.length, 9);
  const blocks = debates.map((c) => c.content as { text: string; cache_control?: unknown }[]);
  assert.ok(blocks.every((b) => b[0].cache_control), "the shared reading is marked for caching");
  assert.equal(new Set(blocks.map((b) => b[0].text)).size, 1, "every debater gets the identical text first");
  assert.equal(new Set(blocks.map((b) => b[1].text)).size, 9, "only the last part says which analyst you are");
});

test("each stage runs on the model picked for it, and Haiku is never sent a fallback it doesn't have", async () => {
  await researchTicker("ACME", { interests: [] });
  const count = (f: (c: (typeof calls)[number]) => boolean) => calls.filter(f).length;
  assert.equal(count((c) => c.searched && c.model === "claude-haiku-5-5"), 6, "six analysts work from prepared sources");
  assert.equal(count((c) => c.searched && c.model === "claude-sonnet-5-5"), 3, "three analysts plan their own searches");
  assert.equal(count((c) => c.system.includes("research debate") && c.model === "claude-sonnet-5-5"), 9);
  assert.equal(count((c) => c.system.includes("You are the judge") && c.model === "claude-opus-5-5"), 1);
  assert.ok(calls.filter((c) => c.model === "claude-haiku-5-5").every((c) => c.fallbacks === undefined));
  assert.ok(calls.filter((c) => c.model !== "claude-haiku-5-5").every((c) => c.fallbacks === "default"));
});

test("when every analyst fails, the run fails with the reason instead of posting an empty card", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replacing an SDK method with a test double
  (anthropic.beta.messages as any).stream = () => ({
    finalMessage: async () => {
      throw new Error("the service is down");
    },
  });
  await assert.rejects(researchTicker("ACME", { interests: [] }), /the service is down/);
});
