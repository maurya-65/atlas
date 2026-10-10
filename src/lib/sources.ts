import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";

// Free, key-less public sources: SEC EDGAR, Google News RSS, Federal Register.

export interface SourceItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  date: string;
  kind: "news" | "filing" | "regulation";
  subject: string;
  query: string;
}

export interface RevenuePoint {
  period: string;
  value: number;
  /** Change vs the same quarter a year earlier, e.g. -0.08 = down 8% */
  yoy: number | null;
}

const SEC_UA = process.env.SEC_USER_AGENT || "Atlas hackathon demo contact@example.com";
const TIMEOUT_MS = 8000;

export function stableId(s: string) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function dedupe(items: SourceItem[]): SourceItem[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: SourceItem[] = [];
  for (const it of items) {
    const t = it.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenUrl.has(it.url) || seenTitle.has(t)) continue;
    seenUrl.add(it.url);
    seenTitle.add(t);
    out.push(it);
  }
  return out;
}

// ---------- SEC EDGAR ----------

interface CompanyInfo {
  cik: string; // 10-digit padded
  cikNum: number;
  ticker: string;
  name: string;
}

let tickerMap: Map<string, CompanyInfo> | null = null;

export async function lookupCompany(ticker: string): Promise<CompanyInfo | null> {
  if (!tickerMap) {
    const data = await getJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
      "https://www.sec.gov/files/company_tickers.json",
      { "User-Agent": SEC_UA },
    );
    if (!data) return null;
    tickerMap = new Map();
    for (const row of Object.values(data)) {
      tickerMap.set(row.ticker.toUpperCase(), {
        cik: String(row.cik_str).padStart(10, "0"),
        cikNum: row.cik_str,
        ticker: row.ticker.toUpperCase(),
        name: row.title,
      });
    }
  }
  return tickerMap.get(ticker.toUpperCase().replace(".", "-")) ?? null;
}

interface Submissions {
  name?: string;
  sicDescription?: string;
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription?: string[];
      items?: string[];
    };
  };
}

const FORM_LABEL: Record<string, string> = {
  "8-K": "8-K (major event report)",
  "10-Q": "10-Q (quarterly report)",
  "10-K": "10-K (annual report)",
};

export async function secFilings(ticker: string, limit = 6): Promise<{ items: SourceItem[]; industry: string | null }> {
  const co = await lookupCompany(ticker);
  if (!co) return { items: [], industry: null };
  const sub = await getJson<Submissions>(`https://data.sec.gov/submissions/CIK${co.cik}.json`, { "User-Agent": SEC_UA });
  const r = sub?.filings?.recent;
  if (!r) return { items: [], industry: sub?.sicDescription ?? null };
  const items: SourceItem[] = [];
  for (let i = 0; i < r.form.length && items.length < limit; i++) {
    const form = r.form[i];
    if (!FORM_LABEL[form]) continue;
    const acc = r.accessionNumber[i].replace(/-/g, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${co.cikNum}/${acc}/${r.primaryDocument[i]}`;
    const desc = r.primaryDocDescription?.[i];
    const itemCodes = r.items?.[i];
    items.push({
      id: stableId(url),
      title: `${co.name} filed ${FORM_LABEL[form]}${desc && desc !== form ? ` — ${desc}` : ""}${itemCodes ? ` (items ${itemCodes})` : ""}`,
      url,
      publisher: "SEC EDGAR",
      date: r.filingDate[i],
      kind: "filing",
      subject: co.ticker,
      query: "sec filings",
    });
  }
  return { items, industry: sub?.sicDescription ?? null };
}

interface FactUnit {
  start?: string;
  end: string;
  val: number;
  fp?: string;
  form?: string;
  frame?: string;
}

const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
];

/** Quarterly (3-month) revenue for the last ~8 quarters, oldest first. */
export async function secRevenue(ticker: string): Promise<RevenuePoint[]> {
  const co = await lookupCompany(ticker);
  if (!co) return [];
  const facts = await getJson<{ facts?: { "us-gaap"?: Record<string, { units?: Record<string, FactUnit[]> }> } }>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${co.cik}.json`,
    { "User-Agent": SEC_UA },
  );
  const gaap = facts?.facts?.["us-gaap"];
  if (!gaap) return [];

  let best: { period: string; end: string; value: number }[] = [];
  for (const tag of REVENUE_TAGS) {
    const units = gaap[tag]?.units?.USD;
    if (!units) continue;
    // Quarterly frames look like "CY2024Q3"; annual "CY2024", instant "CY2024Q3I".
    const byFrame = new Map<string, { period: string; end: string; value: number }>();
    for (const u of units) {
      if (!u.frame || !/^CY\d{4}Q\d$/.test(u.frame)) continue;
      byFrame.set(u.frame, { period: u.frame.replace("CY", ""), end: u.end, value: u.val });
    }
    const series = [...byFrame.values()].sort((a, b) => a.end.localeCompare(b.end));
    // Prefer the tag with the most recent data.
    if (series.length && (!best.length || series[series.length - 1].end > best[best.length - 1].end)) best = series;
  }
  if (!best.length) return [];

  const byPeriod = new Map(best.map((p) => [p.period, p.value]));
  return best.slice(-8).map((p) => {
    const [y, q] = p.period.split("Q");
    const prev = byPeriod.get(`${Number(y) - 1}Q${q}`);
    return { period: p.period, value: p.value, yoy: prev && prev > 0 ? p.value / prev - 1 : null };
  });
}

// ---------- Google News RSS ----------

const xml = new XMLParser({ ignoreAttributes: false });

export async function googleNews(query: string, subject: string, limit = 5): Promise<SourceItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:30d")}&hl=en-US&gl=US&ceid=US:en`;
  const text = await getText(url);
  if (!text) return [];
  try {
    const doc = xml.parse(text);
    let items = doc?.rss?.channel?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return (items as Record<string, unknown>[]).slice(0, limit).map((it) => {
      const link = String(it.link ?? "");
      const src = it.source as { "#text"?: string } | string | undefined;
      const publisher = typeof src === "string" ? src : src?.["#text"] ?? "News";
      let title = String(it.title ?? "");
      // Google appends " - Publisher" to titles.
      if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
      const pub = it.pubDate ? new Date(String(it.pubDate)) : null;
      return {
        id: stableId(link || title),
        title,
        url: link,
        publisher,
        date: pub && !isNaN(pub.getTime()) ? pub.toISOString().slice(0, 10) : "",
        kind: "news" as const,
        subject,
        query,
      };
    });
  } catch {
    return [];
  }
}

/** Short company name for news queries: "Apple Inc." -> "Apple". */
export function shortName(name: string) {
  return name
    .replace(/[,.]/g, " ")
    .replace(/\b(inc|corp|corporation|co|ltd|plc|holdings|group|company|class [a-c]|the)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || name;
}

export function companyNewsQueries(name: string): string[] {
  const n = `"${shortName(name)}"`;
  return [`${n} stock`, `${n} strike OR union OR layoffs`, `${n} regulation OR lawsuit OR investigation`, `${n} earnings revenue`];
}

export function topicNewsQueries(topic: string): string[] {
  return [`${topic} industry regulation`, `${topic} stocks`];
}

// ---------- Federal Register ----------

interface FedRegDoc {
  title: string;
  html_url: string;
  publication_date: string;
  type: string;
  agencies?: { name?: string }[];
}

export async function federalRegister(term: string, subject: string, limit = 5): Promise<SourceItem[]> {
  const url =
    `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${encodeURIComponent(term)}` +
    `&conditions[type][]=RULE&conditions[type][]=PRORULE&order=newest&per_page=${limit}`;
  const data = await getJson<{ results?: FedRegDoc[] }>(url);
  return (data?.results ?? []).map((d) => ({
    id: stableId(d.html_url),
    title: `${d.type === "Proposed Rule" ? "Proposed government rule" : "Government rule"}: ${d.title}`,
    url: d.html_url,
    publisher: d.agencies?.[0]?.name ? `Federal Register · ${d.agencies[0].name}` : "Federal Register",
    date: d.publication_date,
    kind: "regulation" as const,
    subject,
    query: term,
  }));
}

// ---------- Bundles ----------

export interface CompanyBundle {
  ticker: string;
  name: string;
  industry: string | null;
  items: SourceItem[];
  revenue: RevenuePoint[];
}

export async function gatherCompany(ticker: string, fallbackName?: string, newsPerQuery = 4): Promise<CompanyBundle> {
  const co = await lookupCompany(ticker);
  const name = co?.name ?? fallbackName ?? ticker;
  const [filings, revenue, ...news] = await Promise.all([
    secFilings(ticker),
    secRevenue(ticker),
    ...companyNewsQueries(name).map((q) => googleNews(q, ticker.toUpperCase(), newsPerQuery)),
  ]);
  const regTerms = [shortName(name), filings.industry].filter(Boolean) as string[];
  const regs = (await Promise.all(regTerms.map((t) => federalRegister(t, ticker.toUpperCase(), 3)))).flat();
  return {
    ticker: ticker.toUpperCase(),
    name,
    industry: filings.industry,
    items: dedupe([...filings.items, ...news.flat(), ...regs]),
    revenue,
  };
}

export async function gatherTopic(topic: string, newsPerQuery = 4): Promise<SourceItem[]> {
  const [news, regs] = await Promise.all([
    Promise.all(topicNewsQueries(topic).map((q) => googleNews(q, topic, newsPerQuery))),
    federalRegister(topic, topic, 3),
  ]);
  return dedupe([...news.flat(), ...regs]);
}
