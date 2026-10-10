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

let calls: { system: string; searched: boolean }[] = [];

beforeEach(() => {
  calls = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replacing SDK methods with test doubles
  const messages = anthropic.beta.messages as any;
  messages.parse = async ({ system }: { system: string }) => {
    calls.push({ system, searched: false });
    return { stop_reason: "end_turn", parsed_output: system.includes("research debate") ? debater : judge };
  };
  messages.stream = ({ system }: { system: string }) => ({
    finalMessage: async () => {
      calls.push({ system, searched: true });
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

test("eight analysts search, debate once, and a judge gives one verdict", async () => {
  const r = await researchTicker("acme", { interests: [] });
  assert.equal(r.stance, "consider_buying");
  assert.equal(r.confidenceScore, 100, "a score outside 0-100 is clamped");
  assert.equal(r.angles?.length, 8);
  assert.equal(calls.length, 17);
  assert.equal(calls.filter((c) => c.searched).length, 8, "only the analysts search the web");
  assert.ok(calls[16].system.includes("You are the judge"));
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
  assert.equal(r.sources.filter((s) => s.url === REAL.url).length, 1, "eight analysts citing the same page add it once");
  assert.equal(r.sources.some((s) => s.url.includes("made-up.example")), false);

  const n = r.sources.findIndex((s) => s.url === REAL.url) + 1;
  for (const a of r.angles!) {
    assert.ok(a.report.includes(`The company confirmed it [${n}].`), "[W1] became the shared number");
    assert.ok(a.report.includes("A rumour says otherwise."), "the citation of the invented page is dropped");
    assert.deepEqual(a.points[0].sources, [1, n]);
  }
  assert.doesNotMatch(JSON.stringify(r), /\[W\d+\]/i);
});
