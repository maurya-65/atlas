/** The sections of the single Atlas page. The URL hash picks one (for example /#overview). */
export type View = "feed" | "overview" | "daily" | "rules" | "connections";

/** In sidebar order. The landing view is still the agent feed (see viewFromHash). */
export const VIEWS: { id: View; label: string; title: string; description: string; group: "agent" | "setup" }[] = [
  {
    id: "overview",
    label: "Overview",
    title: "Overview",
    description: "Your portfolio in plain numbers and words.",
    group: "agent",
  },
  {
    id: "feed",
    label: "Agent feed",
    title: "Agent feed",
    description: "What Atlas noticed, researched and needs you to decide.",
    group: "agent",
  },
  {
    id: "daily",
    label: "Daily run",
    title: "Daily run",
    description: "A once-a-day check of your portfolio, with a brief.",
    group: "agent",
  },
  {
    id: "rules",
    label: "Rules & interests",
    title: "Rules & interests",
    description: "What Atlas watches for, and the limits it can never cross.",
    group: "setup",
  },
  {
    id: "connections",
    label: "Connections",
    title: "Connections",
    description: "Your brokerage, money mode and Claude.",
    group: "setup",
  },
];

export function viewFromHash(hash: string): View {
  const id = hash.replace(/^#/, "");
  return VIEWS.find((v) => v.id === id)?.id ?? "feed";
}

export function viewHref(view: View): string {
  return `#${view}`;
}
