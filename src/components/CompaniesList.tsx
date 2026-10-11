import { isResearchableStock } from "@/lib/types";
import { companies } from "./derive";
import { money, pct, timeAgo } from "./format";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty } from "./ui";
import { SearchIcon } from "./icons";
import { runningResearch } from "./researchJobs";
import VerdictTag from "./VerdictTag";
import type { ViewProps } from "./viewProps";
import { companyHref } from "./views";

function positionText(value: number, total: number | undefined) {
  return total ? `You own ${money(value, 0)} (${pct(value / total, 0)} of your portfolio)` : `You own ${money(value, 0)}`;
}

/** The library: every company Atlas has researched, and the ones you own or follow that it hasn't. */
export default function CompaniesList({ atlas }: ViewProps) {
  const { state, jobs, actions } = atlas;
  const total = state.portfolio?.total;
  const researched = companies(state);
  const known = new Set(researched.map((c) => c.ticker));

  const notYet = new Map<string, { name: string; value: number | null }>();
  for (const h of state.portfolio?.holdings ?? []) {
    if (isResearchableStock(h.ticker, h.kind) && !known.has(h.ticker)) notYet.set(h.ticker, { name: h.name || h.ticker, value: h.value });
  }
  for (const t of state.watchlist) if (!known.has(t) && !notYet.has(t)) notYet.set(t, { name: t, value: null });

  return (
    <div className="space-y-4">
      {researched.length === 0 ? (
        <Card>
          <CardContent>
            <Empty icon={<SearchIcon />} title="Nothing researched yet.">
              A research reads a company’s filings, news and government notices, has nine analysts argue about it, and ends with a verdict. Every research is kept here, on the company’s own page.{" "}
              <a href="#research/new" className="font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white">
                Start one
              </a>
              .
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Researched companies</CardTitle>
            <CardDescription>Newest research first. Open one for the full report, its history and the decisions about it.</CardDescription>
          </CardHeader>
          <CardContent className="-my-2 divide-y divide-white/[0.07]">
            {researched.map((c) => {
              const r = c.latest.research!;
              const doing = runningResearch(jobs.running, c.ticker);
              return (
                <a key={c.ticker} href={companyHref(c.ticker)} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 transition-colors hover:text-foreground">
                  <span className="min-w-40 flex-1">
                    <span className="font-semibold">{c.ticker}</span>
                    <span className="ml-2 text-muted-foreground">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.holding ? positionText(c.holding.value, total) : c.watched ? "You follow it" : "You don’t own it"}</span>
                  </span>
                  <VerdictTag stance={r.stance} score={r.confidenceScore} />
                  <span className="w-40 text-right text-xs text-muted-foreground">
                    {doing ? "Researching now…" : `${timeAgo(r.generatedAt)} · ${c.verdicts.length} ${c.verdicts.length === 1 ? "research" : "researches"}`}
                    {r.via === "claude" && " · in Claude"}
                  </span>
                </a>
              );
            })}
          </CardContent>
        </Card>
      )}

      {notYet.size > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Not researched yet</CardTitle>
            <CardDescription>Companies you own or follow that Atlas hasn’t looked into.</CardDescription>
          </CardHeader>
          <CardContent className="-my-2 divide-y divide-white/[0.07]">
            {[...notYet].map(([ticker, info]) => (
              <div key={ticker} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <a href={companyHref(ticker)} className="min-w-40 flex-1 hover:text-foreground">
                  <span className="font-semibold">{ticker}</span>
                  {info.name !== ticker && <span className="ml-2 text-muted-foreground">{info.name}</span>}
                  <span className="block text-xs text-muted-foreground">{info.value !== null ? positionText(info.value, total) : "You follow it"}</span>
                </a>
                <Button size="sm" variant="outline" disabled={Boolean(runningResearch(jobs.running, ticker))} onClick={() => actions.research(ticker)}>
                  {runningResearch(jobs.running, ticker) ? "Researching…" : "Research"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
