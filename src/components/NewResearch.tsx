import { useState, type FormEvent } from "react";
import { isResearchableStock } from "@/lib/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea, buttonClass } from "./ui";
import { useExtensionReady } from "./useExtensionReady";
import type { ViewProps } from "./viewProps";
import { companyHref, goTo } from "./views";

const TICKER = /^[A-Z.\-]{1,10}$/;
const MAX_WHAT_IF = 500;
const WHAT_IF_EXAMPLES = ["What if Tesla cuts prices again?", "What if new crypto regulation hits Bitcoin?"];
const RESULT = "text-xs text-muted-foreground";

/** One place to start any work: a company, a sector, a what-if, or your top 3. */
export default function NewResearch({ atlas }: ViewProps) {
  const { state, jobs, actions } = atlas;
  const extensionReady = useExtensionReady();
  const [ticker, setTicker] = useState("");
  const [sector, setSector] = useState("");
  const [scenario, setScenario] = useState("");

  const holdings = (state.portfolio?.holdings ?? []).filter((h) => isResearchableStock(h.ticker, h.kind)).sort((a, b) => b.value - a.value);
  const suggestions = [...new Set([...holdings.map((h) => h.ticker), ...state.watchlist])].slice(0, 8);
  const t = ticker.trim().toUpperCase();
  const kind = holdings.find((h) => h.ticker === t)?.kind;
  const validTicker = TICKER.test(t) && isResearchableStock(t, kind);
  const working = jobs.running.filter((j) => ["research", "whatif", "review", "claude"].includes(j.kind));

  const startCompany = (e: FormEvent) => {
    e.preventDefault();
    if (!validTicker) return;
    actions.research(t);
    setTicker("");
    goTo(companyHref(t));
  };
  const startSector = (e: FormEvent) => {
    e.preventDefault();
    if (!sector.trim()) return;
    actions.sector(sector.trim());
    setSector("");
  };
  const startWhatIf = (e: FormEvent) => {
    e.preventDefault();
    if (!scenario.trim()) return;
    actions.whatIf(scenario.trim());
    setScenario("");
  };

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Research a company</CardTitle>
            <CardDescription>Nine analysts read its filings, news and government notices, argue it out and give a verdict.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={startCompany} className="flex flex-wrap gap-2">
              <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker, for example MSFT" aria-label="Ticker" className="min-w-40 flex-1" autoComplete="off" />
              <Button type="submit" disabled={!validTicker}>
                Research
              </Button>
              {extensionReady && validTicker && (
                <a href={actions.claudeLinkFor(t)} target="_blank" rel="noreferrer" data-atlas-claude className={buttonClass("outline")}>
                  Research in Claude ↗
                </a>
              )}
            </form>
            {t && !validTicker && <p className="text-xs text-live">Type the ticker of a company, like MSFT. Funds and crypto aren’t researched.</p>}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <Button key={s} type="button" size="xs" variant="outline" onClick={() => setTicker(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            )}
            <p className={RESULT}>{validTicker ? `The result will be on Research → ${t}.` : "The result is kept on that company’s page."}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research my top 3</CardTitle>
            <CardDescription>Researches your three biggest company holdings one after another and sums them up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button disabled={holdings.length === 0 || jobs.running.some((j) => j.kind === "review")} onClick={() => actions.review()}>
              Research my top 3
            </Button>
            <p className={RESULT}>
              {holdings.length
                ? `${holdings.slice(0, 3).map((h) => h.ticker).join(", ")}. Each result is kept on its company’s page.`
                : "You don’t hold any company stocks yet."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research a sector</CardTitle>
            <CardDescription>What is happening in an industry right now, and what it means for the stocks you own.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={startSector} className="flex flex-wrap gap-2">
              <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="For example semiconductors" aria-label="Sector" maxLength={80} className="min-w-40 flex-1" />
              <Button type="submit" disabled={!sector.trim()}>
                Research
              </Button>
            </form>
            <p className={RESULT}>The result will be on Research → What-ifs.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Try a what-if</CardTitle>
            <CardDescription>Describe an event. Atlas traces how it could reach your stocks, with a rough dollar range.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={startWhatIf} className="space-y-2">
              <Textarea value={scenario} onChange={(e) => setScenario(e.target.value)} rows={2} maxLength={MAX_WHAT_IF} placeholder="What if…" aria-label="What-if" className="resize-none" />
              <Button type="submit" disabled={!scenario.trim()}>
                Run what-if
              </Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {WHAT_IF_EXAMPLES.map((example) => (
                <Button key={example} type="button" size="xs" variant="outline" onClick={() => setScenario(example)}>
                  {example}
                </Button>
              ))}
            </div>
            <p className={RESULT}>The result will be on Research → What-ifs.</p>
          </CardContent>
        </Card>
      </div>

      {working.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Running now</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-white/[0.07]">
            {working.map((job) => (
              <div key={job.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="font-medium">{job.label}</span>
                <span className="flex-1 text-muted-foreground">{job.detail ?? "Working…"}</span>
                <a href={job.landing.href} className="text-xs font-medium underline decoration-white/25 underline-offset-4 hover:decoration-white">
                  Will be in {job.landing.text}
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
