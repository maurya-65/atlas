/** The sections of the single Atlas page. The URL hash picks one (for example /#inbox); a chat is /#chat/<id>. */
export type View = "chat" | "inbox" | "overview" | "daily" | "rules" | "claude" | "settings";

/** In sidebar order. The landing view is the Portfolio (see viewFromHash). */
export const VIEWS: { id: View; label: string; title: string; description: string; group: "agent" | "setup" }[] = [
  {
    id: "overview",
    label: "Portfolio",
    title: "Portfolio",
    description: "What you own, in plain numbers.",
    group: "agent",
  },
  {
    id: "chat",
    label: "Chat",
    title: "Chat",
    description: "Ask questions, research a stock or try a what-if.",
    group: "agent",
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Inbox",
    description: "What Atlas found on its own, and trades waiting for your yes or no.",
    group: "agent",
  },
  {
    id: "daily",
    label: "Daily run",
    title: "Daily run",
    description: "Atlas checks your portfolio once a day and leaves a brief in your Inbox.",
    group: "agent",
  },
  {
    id: "rules",
    label: "Rules & topics",
    title: "Rules & topics",
    description: "What Atlas watches for, and the limits it can never cross.",
    group: "setup",
  },
  {
    id: "claude",
    label: "Claude setup",
    title: "Claude setup",
    description: "Add the Chrome extension so Deep Research in Claude comes back here by itself.",
    group: "setup",
  },
  {
    id: "settings",
    label: "Settings",
    title: "Settings",
    description: "Brokerage, paper or real money, and Claude.",
    group: "setup",
  },
];

export function viewFromHash(hash: string): View {
  const id = hash.replace(/^#/, "").split("/")[0];
  return VIEWS.find((v) => v.id === id)?.id ?? "overview";
}

/** The chat a hash like #chat/<id> points at. */
export function threadFromHash(hash: string): string | null {
  return /^#chat\/([A-Za-z0-9-]+)$/.exec(hash)?.[1] ?? null;
}

export function viewHref(view: View): string {
  return `#${view}`;
}
