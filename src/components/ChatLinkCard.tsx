import type { ChatMessage } from "@/lib/types";
import { STANCE_LABEL } from "./derive";
import { clockTime } from "./format";
import { companyHref } from "./views";

const MAX_SCENARIO = 120;

/** A research or what-if that was started in a chat: the result lives on the Research page, so the chat only points to it. */
export default function ChatLinkCard({ m }: { m: ChatMessage }) {
  const research = m.research;
  const scenario = m.scenario;
  if (!research && !scenario) return null;

  const title = research
    ? `${research.ticker} research · ${STANCE_LABEL[research.stance]}${research.confidenceScore != null ? `, ${research.confidenceScore}/100` : ""}`
    : scenario!.scenario.length > MAX_SCENARIO
      ? `${scenario!.scenario.slice(0, MAX_SCENARIO - 1).trimEnd()}…`
      : scenario!.scenario;

  return (
    <a
      href={research ? companyHref(research.ticker) : "#research/scenarios"}
      className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm transition-colors hover:bg-white/[0.06]"
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {research ? "Research" : "What-if"} · <time dateTime={m.createdAt}>{clockTime(m.createdAt)}</time>
        </span>
        <span className="mt-0.5 block font-semibold">{title}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{research ? "Open company page" : "Open in Research"} →</span>
    </a>
  );
}
