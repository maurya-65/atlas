"use client";

import CompaniesList from "./CompaniesList";
import CompanyPage from "./CompanyPage";
import { companies, STANCE_LABEL } from "./derive";
import { timeAgo } from "./format";
import NewResearch from "./NewResearch";
import ScenariosList from "./ScenariosList";
import { PageIntro, buttonClass, cn } from "./ui";
import type { ViewProps } from "./viewProps";
import { researchSub } from "./views";
import WatchlistPage from "./WatchlistPage";

const TABS = [
  { page: "companies", label: "Companies", href: "#research" },
  { page: "new", label: "New research", href: "#research/new" },
  { page: "watchlist", label: "Watchlist", href: "#research/watchlist" },
  { page: "scenarios", label: "What-ifs", href: "#research/scenarios" },
] as const;

export default function ResearchView(props: ViewProps) {
  const { atlas } = props;
  const sub = researchSub(props.route);
  const researched = companies(atlas.state);
  const running = atlas.jobs.running.filter((j) => ["research", "whatif", "review", "claude"].includes(j.kind));
  const newest = researched[0];

  const intro = {
    companies: {
      what: "Everything Atlas has found out about a company, kept in one place. Research started anywhere in Atlas ends up here.",
      now: researched.length
        ? `${researched.length} ${researched.length === 1 ? "company" : "companies"} researched. Latest: ${newest.ticker}, ${timeAgo(newest.latest.research!.generatedAt)}.`
        : "Nothing researched yet.",
    },
    new: {
      what: "Start a research, a sector look or a what-if. Each result is saved, and the toast tells you where.",
      now: running.length ? `${running.length} running now.` : undefined,
    },
    watchlist: { what: "Companies you follow without owning them, so each is one click from a research.", now: `${atlas.state.watchlist.length} followed.` },
    scenarios: { what: "Every what-if and sector research Atlas has run, newest first.", now: undefined },
    company: {
      what: sub.page === "company" ? `Everything Atlas knows about ${sub.ticker}: the latest research, how the verdict changed, and what you decided.` : "",
      now:
        sub.page === "company" && researched.find((c) => c.ticker === sub.ticker)
          ? `Latest verdict: ${STANCE_LABEL[researched.find((c) => c.ticker === sub.ticker)!.latest.research!.stance]}.`
          : undefined,
    },
  }[sub.page];

  return (
    <div className="space-y-4">
      <PageIntro
        what={intro.what}
        now={intro.now}
        actions={
          sub.page === "company" ? (
            <a href="#research" className={buttonClass("outline", "sm")}>
              All companies
            </a>
          ) : sub.page !== "new" ? (
            <a href="#research/new" className={buttonClass("default", "sm")}>
              New research
            </a>
          ) : undefined
        }
      />

      <nav aria-label="Research" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <a
            key={t.page}
            href={t.href}
            aria-current={sub.page === t.page ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors",
              sub.page === t.page ? "border-white/25 bg-white/[0.14] font-medium text-foreground" : "border-white/10 text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
            )}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {sub.page === "companies" && <CompaniesList {...props} />}
      {sub.page === "new" && <NewResearch {...props} />}
      {sub.page === "watchlist" && <WatchlistPage {...props} />}
      {sub.page === "scenarios" && <ScenariosList {...props} />}
      {sub.page === "company" && <CompanyPage atlas={atlas} ticker={sub.ticker} />}
    </div>
  );
}
