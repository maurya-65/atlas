import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChatMessage, Rule, Store } from "./types";

// Single-user JSON file store. Fine for a hackathon demo; swap for a DB later.
const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

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
  };
}

let queue: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<Store> {
  // Only a missing file means "first run". A file that is busy or half-written (another process is saving
  // it) is retried and then reported, never replaced with an empty store: that would wipe the user's data.
  for (let attempt = 0; ; attempt++) {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      return { ...fresh(), ...JSON.parse(raw) } as Store;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        const s = fresh();
        await writeStore(s);
        return s;
      }
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function writeStore(s: Store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(s, null, 2));
  await fs.rename(tmp, FILE);
}

/** Serialised read-modify-write so concurrent requests don't clobber each other. */
export function updateStore<T>(fn: (s: Store) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const s = await readStore();
    const result = await fn(s);
    await writeStore(s);
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

export async function resetStore() {
  await writeStore(fresh());
}
