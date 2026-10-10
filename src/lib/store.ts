import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChatMessage, Rule, Store } from "./types";

// Single-user store: the whole state is one JSON document.
// - On your own computer it is a file (.data/store.json, or ATLAS_DATA_DIR).
// - On a host with no writable disk (Vercel) it is one key in Upstash Redis, used when the REST
//   credentials are set. Vercel's Upstash integration provides them under either pair of names.
const DATA_DIR = process.env.ATLAS_DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "atlas:store";
export const storeKind: "redis" | "file" = REDIS_URL && REDIS_TOKEN ? "redis" : "file";

// Starting rules. Plain-English reasoning lives in README.md ("Default guardrails").
const DEFAULT_RULES: Omit<Rule, "id" | "createdAt">[] = [
  {
    kind: "concentration",
    threshold: 25,
    action: "flag",
    text: "Tell me if any single stock grows past 25% of my portfolio.",
  },
  {
    kind: "drawdown",
    threshold: 10,
    action: "flag",
    text: "Tell me if any stock falls 10% or more below what I paid for it.",
  },
  {
    kind: "idle_cash",
    threshold: 10,
    action: "flag",
    text: "Tell me if more than 10% of my portfolio is sitting in cash.",
  },
];

function fresh(): Store {
  const now = new Date().toISOString();
  return {
    snaptradeUser: null,
    selectedAccountId: null,
    mode: "paper",
    interests: [],
    rules: DEFAULT_RULES.map((r) => ({ ...r, id: randomUUID(), createdAt: now })),
    messages: [
      {
        id: randomUUID(),
        kind: "agent",
        createdAt: now,
        text:
          "Hi, I'm Atlas. I watch your real brokerage account, read public news, SEC filings and government notices about the companies you own or care about, and tell you when something matters.\n\n" +
          "I never trade on my own. Anything that needs a decision shows up as a card with my recommendation, and you choose. Right now you're in **paper mode**: every trade is simulated and no real money moves.\n\n" +
          "Start by connecting your brokerage under Connections. Then run a **what-if** or **research** one of your stocks below. To chat with me, add Atlas to the Claude app.",
      },
    ],
    paper: null,
    trades: [],
    seenSignals: [],
    lastScanAt: null,
    daily: { enabled: false, time: "09:00", depth: 1, lastRunAt: null, lastRunDay: null, runningSince: null, researchedAt: {}, lastSnapshot: null },
    memory: [],
  };
}

/** Fill in anything a store saved by an older version doesn't have yet. */
function withDefaults(saved: Partial<Store>): Store {
  const base = fresh();
  return { ...base, ...saved, daily: { ...base.daily, ...saved.daily } };
}

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error(`The Atlas store couldn't be reached (${body?.error ?? `status ${res.status}`}).`);
  return body.result;
}

async function load(): Promise<string | null> {
  if (storeKind === "redis") return ((await redis(["GET", REDIS_KEY])) as string | null) ?? null;
  // Only a missing file means "first run". A file that is busy or half-written (another process is saving
  // it) is retried and then reported, never treated as empty: that would wipe the user's data.
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.readFile(FILE, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function save(s: Store) {
  if (storeKind === "redis") {
    await redis(["SET", REDIS_KEY, JSON.stringify(s)]);
    remember(s);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE);
}

// One page load reads the store several times. Over the network that is slow, so plain reads may reuse
// a copy for a moment. Updates always fetch the latest first.
const REMOTE_READ_TTL_MS = 1500;
let recent: { at: number; json: string } | null = null;
function remember(s: Store) {
  recent = { at: Date.now(), json: JSON.stringify(s) };
}

async function fetchStore(): Promise<Store> {
  for (let attempt = 0; ; attempt++) {
    const raw = await load();
    if (raw == null) {
      const s = fresh();
      await save(s);
      return s;
    }
    try {
      const s = withDefaults(JSON.parse(raw));
      if (storeKind === "redis") remember(s);
      return s;
    } catch (e) {
      // Text that doesn't parse may be a save caught halfway; look again before reporting it.
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export async function readStore(): Promise<Store> {
  if (storeKind === "redis" && recent && Date.now() - recent.at < REMOTE_READ_TTL_MS) return JSON.parse(recent.json) as Store;
  return fetchStore();
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialised read-modify-write so concurrent requests don't clobber each other. */
export function updateStore<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const s = await fetchStore();
    const result = await fn(s);
    await save(s);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function newMessage(m: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
  return { ...m, id: randomUUID(), createdAt: new Date().toISOString() };
}

export async function addMessages(...msgs: ChatMessage[]) {
  await updateStore((s) => {
    s.messages.push(...msgs);
  });
  return msgs;
}

/** Start over with an empty store. `keep` copies things across (the brokerage link) in the same write. */
export function resetStore(keep?: (before: Store, after: Store) => void) {
  const run = queue.then(async () => {
    const before = keep ? await fetchStore() : null;
    const s = fresh();
    if (before) keep!(before, s);
    await save(s);
  });
  queue = run.catch(() => undefined);
  return run;
}
