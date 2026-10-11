import { useSyncExternalStore } from "react";

/**
 * The sections of the single Atlas page. The URL hash picks one, and some sections have a second level:
 *   #home  #portfolio[/holdings|performance|paper|orders]  #research[/new|watchlist|scenarios|<TICKER>]
 *   #decisions  #watching  #chat[/<id>]  #history  #settings[/<section>]
 */
export type View = "home" | "portfolio" | "research" | "decisions" | "watching" | "chat" | "history" | "settings";

export interface ViewInfo {
  id: View;
  label: string;
  title: string;
  /** One line under the title: what this page is for */
  description: string;
}

/** In sidebar order. The landing view is Home. */
export const VIEWS: ViewInfo[] = [
  { id: "home", label: "Home", title: "Home", description: "What needs you, what changed, and what Atlas is doing right now." },
  { id: "portfolio", label: "Portfolio", title: "Portfolio", description: "What you own, how it is doing, and your paper account." },
  { id: "research", label: "Research", title: "Research", description: "Everything Atlas knows about a company. Start a new research here." },
  { id: "decisions", label: "Decisions", title: "Decisions", description: "Trades and suggestions waiting for your yes or no, and what you decided before." },
  { id: "watching", label: "Watching", title: "Watching", description: "What Atlas keeps an eye on for you, and when it checks." },
  { id: "chat", label: "Chat", title: "Chat", description: "Ask a question about your portfolio or an investing term." },
  { id: "history", label: "History", title: "History", description: "Everything Atlas has done, newest first." },
  { id: "settings", label: "Settings", title: "Settings", description: "Brokerage, paper or real money, safety limits, Claude and memory." },
];

export const PORTFOLIO_TABS = ["holdings", "performance", "paper", "orders"] as const;
export type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

export const SETTINGS_SECTIONS = ["brokerage", "safety", "claude", "memory", "reset"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Research second level: a fixed page, or a company when it looks like a ticker. */
export type ResearchSub = { page: "companies" | "new" | "watchlist" | "scenarios" } | { page: "company"; ticker: string };

export interface Route {
  view: View;
  /** Everything after the first "/", or null */
  sub: string | null;
}

const TICKER = /^[A-Za-z.\-]{1,10}$/;

export function routeFromHash(hash: string): Route {
  const [first = "", ...rest] = hash.replace(/^#/, "").split("/");
  const view = VIEWS.find((v) => v.id === first)?.id ?? "home";
  return { view, sub: rest.length ? rest.join("/") : null };
}

export function portfolioTab(route: Route): PortfolioTab {
  return PORTFOLIO_TABS.find((t) => t === route.sub) ?? "holdings";
}

export function settingsSection(route: Route): SettingsSection | null {
  return SETTINGS_SECTIONS.find((s) => s === route.sub) ?? null;
}

export function researchSub(route: Route): ResearchSub {
  const sub = route.sub ?? "";
  if (sub === "new" || sub === "watchlist" || sub === "scenarios") return { page: sub };
  if (TICKER.test(sub)) return { page: "company", ticker: sub.toUpperCase() };
  return { page: "companies" };
}

/** The chat a route points at, for #chat/<id>. */
export function threadFromRoute(route: Route): string | null {
  return route.view === "chat" && route.sub && /^[A-Za-z0-9-]+$/.test(route.sub) ? route.sub : null;
}

export const homeHref = "#home";
export const companyHref = (ticker: string) => `#research/${ticker.toUpperCase()}`;
export const portfolioHref = (tab: PortfolioTab = "holdings") => (tab === "holdings" ? "#portfolio" : `#portfolio/${tab}`);
export const viewHref = (view: View) => `#${view}`;

/** The current URL hash, kept in step with the address bar. */
export function useHash(): string {
  return useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
}

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Changing the hash is how the page switches section; it lives here so components don't assign to `window` themselves. */
export function goTo(hash: string) {
  window.location.hash = hash;
}
