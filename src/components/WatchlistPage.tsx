import { useState, type FormEvent } from "react";
import { isResearchableStock } from "@/lib/types";
import { companies } from "./derive";
import { timeAgo } from "./format";
import { EyeIcon } from "./icons";
import { runningResearch } from "./researchJobs";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input } from "./ui";
import VerdictTag from "./VerdictTag";
import type { ViewProps } from "./viewProps";
import { companyHref } from "./views";

const TICKER = /^[A-Z.\-]{1,10}$/;

/** Companies the user follows without owning them. */
export default function WatchlistPage({ atlas }: ViewProps) {
  const { state, jobs, actions } = atlas;
  const [ticker, setTicker] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const researched = new Map(companies(state).map((c) => [c.ticker, c]));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!TICKER.test(t) || !isResearchableStock(t)) {
      setProblem("Type the ticker of a company, like MSFT. Funds and crypto can’t be followed here.");
      return;
    }
    setProblem(null);
    setTicker("");
    actions.watch(t);
  };

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Follow a company</CardTitle>
          <CardDescription>A company you don’t own but want to keep within reach. It stays on this list so it is one click from a research.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker, for example NVDA" aria-label="Ticker to follow" className="min-w-40 flex-1" autoComplete="off" />
            <Button type="submit" disabled={!ticker.trim()}>
              Follow
            </Button>
          </form>
          {problem && <p className="text-xs text-live">{problem}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your watchlist</CardTitle>
        </CardHeader>
        <CardContent className="-my-2 divide-y divide-white/[0.07]">
          {state.watchlist.length === 0 ? (
            <Empty icon={<EyeIcon />} title="You aren’t following any company yet.">
              Add a ticker above to keep a company you don’t own within reach.
            </Empty>
          ) : (
            state.watchlist.map((t) => {
              const c = researched.get(t);
              const doing = runningResearch(jobs.running, t);
              return (
                <div key={t} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <a href={companyHref(t)} className="min-w-40 flex-1 hover:text-foreground">
                    <span className="font-semibold">{t}</span>
                    {c && c.name !== t && <span className="ml-2 text-muted-foreground">{c.name}</span>}
                    <span className="block text-xs text-muted-foreground">{c ? `Researched ${timeAgo(c.latest.research!.generatedAt)}` : "Not researched yet"}</span>
                  </a>
                  {c && <VerdictTag stance={c.latest.research!.stance} score={c.latest.research!.confidenceScore} />}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={Boolean(doing)} onClick={() => actions.research(t)}>
                      {doing ? "Researching…" : c ? "Research again" : "Research"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => actions.unwatch(t)}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
