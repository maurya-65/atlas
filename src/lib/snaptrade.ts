import { Snaptrade, SnaptradeAuth, type Account } from "snaptrade-typescript-sdk";
import { randomUUID } from "crypto";
import { readStore, updateStore } from "./store";
import type { Holding, Portfolio } from "./types";

const clientId = process.env.SNAPTRADE_CLIENT_ID;
const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

/**
 * "personal": the key belongs to one person; brokerages are linked in the SnapTrade dashboard
 * (or the portal) and requests carry no user credentials. This is what the SnapTrade dashboard hands out.
 * "commercial": an app key; Atlas registers a SnapTrade user and passes userId/userSecret on each call.
 */
export const snaptradeAuthMode: "personal" | "commercial" =
  process.env.SNAPTRADE_AUTH_MODE === "commercial" ? "commercial" : "personal";

export const snaptradeConfigured = Boolean(clientId && consumerKey);

// Both auth modes expose the same API surface; only whether userId/userSecret are passed differs (see creds()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = Snaptrade<any>;

const client: AnyClient | null = snaptradeConfigured
  ? new Snaptrade({
      auth:
        snaptradeAuthMode === "personal"
          ? SnaptradeAuth.personalApiKey({ clientId: clientId!, consumerKey: consumerKey! })
          : SnaptradeAuth.commercialApiKey({ clientId: clientId!, consumerKey: consumerKey! }),
    })
  : null;

function requireClient() {
  if (!client) throw new Error("SnapTrade keys are missing. Add SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY to .env.local.");
  return client;
}

/** SnapTrade errors carry the useful detail in the response body. */
export function snaptradeErrorText(e: unknown): string {
  const err = e as { responseBody?: unknown; message?: string };
  if (err?.responseBody) {
    const body = err.responseBody as { detail?: string; message?: string };
    return body.detail ?? body.message ?? JSON.stringify(err.responseBody);
  }
  return err?.message ?? String(e);
}

/** User credentials for commercial mode; nothing for personal mode. Null = commercial user not registered yet. */
async function creds(): Promise<{ userId: string; userSecret: string } | Record<string, never> | null> {
  if (snaptradeAuthMode === "personal") return {};
  return (await readStore()).snaptradeUser;
}

async function ensureCreds() {
  const existing = await creds();
  if (existing) return existing;
  const userId = `atlas-${randomUUID()}`;
  const { data } = await requireClient().authentication.registerSnapTradeUser({ userId });
  const user = { userId: data.userId ?? userId, userSecret: data.userSecret! };
  await updateStore((st) => {
    st.snaptradeUser = user;
  });
  return user;
}

// Personal keys are rate limited per account (about 10 requests/minute), and the UI refreshes state
// after every click and on a timer, so reads are cached. Requests for the same thing share one call,
// and after a failure (usually a 429) the last good answer is served while SnapTrade is left alone
// for a moment. Trades clear the cache.
const TTL_MS = 60_000;
const ACCOUNTS_TTL_MS = 5 * 60_000;
const ERROR_BACKOFF_MS = 30_000;
interface Entry {
  at: number;
  value?: unknown;
  pending?: Promise<unknown>;
  failedAt?: number;
  error?: unknown;
}
const cache = new Map<string, Entry>();
async function cached<T>(key: string, load: () => Promise<T>, ttl = TTL_MS): Promise<T> {
  const hit: Entry = cache.get(key) ?? { at: 0 };
  const now = Date.now();
  if (hit.value !== undefined && now - hit.at < ttl) return hit.value as T;
  if (hit.pending) return hit.pending as Promise<T>;
  if (hit.failedAt && now - hit.failedAt < ERROR_BACKOFF_MS) {
    if (hit.value !== undefined) return hit.value as T;
    throw hit.error;
  }
  const pending = load().then(
    (value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    },
    (error) => {
      cache.set(key, { at: hit.at, value: hit.value, failedAt: Date.now(), error });
      if (hit.value !== undefined) return hit.value as T;
      throw error;
    },
  );
  cache.set(key, { ...hit, pending });
  return pending;
}
export function clearSnaptradeCache() {
  cache.clear();
}

/** Link to SnapTrade's hosted connection portal, where the user logs into their broker. */
export async function connectionPortalUrl(redirect: string): Promise<string> {
  const c = await ensureCreds();
  const { data } = await requireClient().authentication.loginSnapTradeUser({
    ...c,
    connectionType: "trade",
    customRedirect: redirect,
    immediateRedirect: true,
    ...(process.env.SNAPTRADE_BROKER ? { broker: process.env.SNAPTRADE_BROKER } : {}),
  });
  clearSnaptradeCache();
  if (data && "redirectURI" in data && data.redirectURI) return data.redirectURI;
  throw new Error("SnapTrade did not return a connection link.");
}

export async function listAccounts(): Promise<Account[]> {
  const c = await creds();
  if (!client || !c) return [];
  return cached("accounts", async () => (await client.accountInformation.listUserAccounts({ ...c })).data as Account[], ACCOUNTS_TTL_MS);
}

async function activeAccountId(): Promise<string | null> {
  const s = await readStore();
  const accounts = await listAccounts();
  if (!accounts.length) return null;
  const chosen = accounts.find((a) => a.id === s.selectedAccountId) ?? accounts[0];
  if (chosen.id !== s.selectedAccountId) {
    await updateStore((st) => {
      st.selectedAccountId = chosen.id;
    });
  }
  return chosen.id;
}

/** Live holdings, balances and recent orders straight from the user's brokerage. */
export async function realPortfolio(): Promise<Portfolio | null> {
  const c = await creds();
  if (!client || !c) return null;
  const accountId = await activeAccountId();
  if (!accountId) return null;

  const accounts = await listAccounts();
  const account = accounts.find((x) => x.id === accountId);

  // getUserHoldings is retired; positions, balances and orders are separate endpoints now.
  const [positions, balances] = await Promise.all([
    cached(`positions:${accountId}`, async () => (await client.accountInformation.getAllAccountPositions({ ...c, accountId })).data),
    cached(`balance:${accountId}`, async () => (await client.accountInformation.getUserAccountBalance({ ...c, accountId })).data),
  ]);
  // Orders are optional detail; never fail the portfolio over them.
  const orders = await cached(
    `orders:${accountId}`,
    async () => (await client.accountInformation.getUserAccountRecentOrders({ ...c, accountId, onlyExecuted: false })).data.orders ?? [],
  ).catch(() => []);

  const holdings: Holding[] = (positions.results ?? [])
    .filter((p) => !p.cash_equivalent)
    .map((p) => {
      const units = Number(p.units ?? 0);
      const price = Number(p.price ?? 0);
      const avg = p.cost_basis != null && Number(p.cost_basis) > 0 ? Number(p.cost_basis) : null;
      const ins = p.instrument as { symbol?: string; raw_symbol?: string; description?: string | null; kind?: string };
      return {
        ticker: ins?.raw_symbol ?? ins?.symbol ?? "?",
        name: ins?.description ?? "",
        units,
        price,
        value: units * price,
        avgCost: avg,
        pnlPct: avg && price > 0 ? price / avg - 1 : null,
        kind: ins?.kind ?? null,
      };
    })
    .filter((h) => h.units !== 0);

  const cash = (balances ?? []).reduce((sum, b) => sum + Number(b.cash ?? 0), 0);
  const invested = holdings.reduce((sum, h) => sum + h.value, 0);

  return {
    source: "snaptrade",
    sourceLabel: `Live data from ${account?.institution_name ?? "your brokerage"} via SnapTrade`,
    accountId,
    accountName: account?.name ?? account?.institution_name ?? null,
    brokerIsPaper: account?.is_paper ?? null,
    holdings,
    cash,
    total: invested + cash,
    recentOrders: orders.slice(0, 8).map((o) => ({
      ticker: o.universal_symbol?.symbol ?? "?",
      action: o.action ?? "",
      status: String(o.status ?? ""),
      quantity: o.total_quantity ?? "",
      time: o.time_placed ?? "",
    })),
  };
}

export async function quote(ticker: string): Promise<number | null> {
  const c = await creds();
  if (!client || !c) return null;
  const accountId = await activeAccountId();
  if (!accountId) return null;
  try {
    const data = await cached(`quote:${ticker}`, async () =>
      (await client.trading.getUserAccountQuotes({ ...c, accountId, symbols: ticker, useTicker: true })).data,
    );
    const q = data[0];
    return q?.last_trade_price ?? q?.ask_price ?? null;
  } catch {
    return null;
  }
}

/**
 * Real order through the user's own brokerage. Callers must enforce the live caps first (see trading.ts).
 * Market order, valid for the day, sized in dollars ("notional") so a $25 cap means exactly $25.
 */
export async function placeRealOrder(ticker: string, side: "BUY" | "SELL", dollars: number, price: number | null) {
  const c = await creds();
  if (!c) throw new Error("No brokerage connected.");
  const accountId = await activeAccountId();
  if (!accountId) throw new Error("No brokerage account found.");
  const base = {
    ...c,
    account_id: accountId,
    action: side,
    symbol: ticker,
    order_type: "Market" as const,
    time_in_force: "Day" as const,
  };
  try {
    try {
      const { data } = await requireClient().trading.placeForceOrder({ ...base, notional_value: dollars });
      return data;
    } catch (e) {
      // Some brokers don't accept dollar-sized orders. Fall back to whole shares that still fit under the cap.
      if (!price || price <= 0) throw new Error(snaptradeErrorText(e));
      const units = Math.floor(dollars / price);
      if (units < 1) {
        throw new Error(
          `Your broker doesn't accept dollar-amount orders, and one share of ${ticker} ($${price.toFixed(2)}) costs more than the $${dollars} limit.`,
        );
      }
      try {
        const { data } = await requireClient().trading.placeForceOrder({ ...base, units });
        return data;
      } catch (e2) {
        throw new Error(snaptradeErrorText(e2));
      }
    }
  } finally {
    clearSnaptradeCache();
  }
}
