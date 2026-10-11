import AgentRoom from "./AgentRoom";
import { companyDetail } from "./derive";
import { money, pct, signedPct, timeAgo } from "./format";
import { SearchIcon } from "./icons";
import ResearchCard from "./ResearchCard";
import { runningResearch } from "./researchJobs";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Details, Empty, FeedRow, buttonClass } from "./ui";
import { useExtensionReady } from "./useExtensionReady";
import VerdictHistory from "./VerdictHistory";
import VerdictTag from "./VerdictTag";
import type { ViewProps } from "./viewProps";

/** Everything Atlas knows about one company. Works for a ticker with no research yet. */
export default function CompanyPage({ atlas, ticker }: { atlas: ViewProps["atlas"]; ticker: string }) {
  const { state, jobs, actions } = atlas;
  const extensionReady = useExtensionReady();
  const detail = companyDetail(state, ticker);
  const latest = detail.research[0];
  const earlier = detail.research.slice(1);
  const doing = runningResearch(jobs.running, ticker);
  const { holding } = detail;
  const total = state.portfolio?.total;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {detail.ticker} <span className="font-normal text-muted-foreground">{detail.name !== detail.ticker && detail.name}</span>
          </CardTitle>
          <CardDescription>
            {holding
              ? `You own ${money(holding.value, 0)}${total ? ` (${pct(holding.value / total, 0)} of your portfolio)` : ""}${holding.pnlPct === null ? "" : `, ${signedPct(holding.pnlPct)} since you bought it`}.`
              : detail.watched
                ? "You follow this company but don’t own it."
                : "You don’t own this company."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {latest?.research && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <VerdictTag stance={latest.research.stance} score={latest.research.confidenceScore} />
              <span className="text-xs text-muted-foreground">Last researched {timeAgo(latest.research.generatedAt)}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={Boolean(doing)} onClick={() => actions.research(detail.ticker)}>
              {doing ? "Researching…" : latest ? "Research again" : "Research"}
            </Button>
            {extensionReady && (
              <a href={actions.claudeLinkFor(detail.ticker)} target="_blank" rel="noreferrer" data-atlas-claude className={buttonClass("outline", "sm")}>
                Research in Claude ↗
              </a>
            )}
            {!holding && (
              <Button size="sm" variant="outline" onClick={() => (detail.watched ? actions.unwatch(detail.ticker) : actions.watch(detail.ticker))}>
                {detail.watched ? "Stop watching" : "Add to watchlist"}
              </Button>
            )}
            <a href="#watching" className={buttonClass("ghost", "sm")}>
              Set a price alert
            </a>
          </div>
        </CardContent>
      </Card>

      {doing && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{doing.kind === "claude" ? "Claude is researching this company" : "Atlas is researching this company"}</CardTitle>
            <CardDescription>{doing.detail ?? "Working…"} The report appears below when it is done.</CardDescription>
          </CardHeader>
          {doing.events.length > 0 && (
            <CardContent>
              <AgentRoom events={doing.events} live />
            </CardContent>
          )}
        </Card>
      )}

      {latest?.research ? (
        <ResearchCard r={latest.research} m={latest} onChoose={actions.choose} disabled={Boolean(atlas.choosing)} />
      ) : (
        !doing && (
          <Card>
            <CardContent>
              <Empty icon={<SearchIcon />} title={`${detail.ticker} hasn’t been researched yet.`}>
                Press Research above. Atlas reads the company’s filings, news and government notices and ends with a verdict you can come back to.
              </Empty>
            </CardContent>
          </Card>
        )
      )}

      {detail.verdicts.length > 0 && <VerdictHistory verdicts={detail.verdicts} />}

      {earlier.length > 0 && (
        <Card size="sm">
          <CardContent>
            <Details label={`earlier research (${earlier.length})`}>
              {earlier.map((m) => (
                <ResearchCard key={m.id} r={m.research!} m={m} />
              ))}
            </Details>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Decisions about {detail.ticker}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.decisions.length === 0 ? (
              <p className="text-muted-foreground">Nothing has come up yet.</p>
            ) : (
              <>
                {detail.decisions.slice(0, 5).map((m) => (
                  <FeedRow key={m.id} kind={m.resolved ? "Decided" : "Waiting"} text={m.title ?? m.text} time={timeAgo(m.createdAt)}>
                    <p className="text-muted-foreground">{m.resolved ? `You chose: ${m.resolved}` : m.recommendation}</p>
                  </FeedRow>
                ))}
                <a href="#decisions" className="inline-block text-xs font-medium underline decoration-white/25 underline-offset-4 hover:decoration-white">
                  See all in Decisions
                </a>
              </>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Rules on {detail.ticker}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.rules.length === 0 ? (
              <p className="text-muted-foreground">No price alert is set on this company.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {detail.rules.map((r) => (
                  <li key={r.id}>{r.text}</li>
                ))}
              </ul>
            )}
            <a href="#watching" className="inline-block text-xs font-medium underline decoration-white/25 underline-offset-4 hover:decoration-white">
              Manage rules in Watching
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
