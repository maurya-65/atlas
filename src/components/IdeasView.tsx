"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { TrackedIdea } from "@/lib/ideas";
import { api, money, signedPct } from "./format";
import IdeaSessionCard from "./IdeaSessionCard";
import IdeaStageRail from "./IdeaStageRail";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageIntro, Table, Td, Textarea, Th, Tr } from "./ui";
import type { ViewProps } from "./viewProps";

const EXAMPLES = ["I have about $20,000 and want something fairly safe that pays dividends", "What looks good in AI infrastructure right now?", "I'm 25 and want to start investing $200 a month"];
const MAX_PROMPT = 500;

/** The ideas put in paper and what each has done since. Reloads when a new one is placed. */
function useTracked(placed: number) {
  const [data, setData] = useState<{ tracked: TrackedIdea[]; total: number } | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api("/api/ideas"));
    } catch {
      // The ideas still show; only their gain or loss is missing.
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when the page opens or an idea is placed
    load();
  }, [load, placed]);
  return data;
}

export default function IdeasView({ atlas, route }: ViewProps) {
  const { state, jobs, ideasRun, actions } = atlas;
  const [prompt, setPrompt] = useState("");
  const sessions = [...state.messages].filter((m) => m.kind === "ideas" && m.ideas).reverse();
  const placed = sessions.reduce((n, m) => n + m.ideas!.ideas.filter((i) => i.trade).length, 0);
  const tracking = useTracked(placed);
  const searching = jobs.running.some((j) => j.kind === "ideas");
  const failed = jobs.jobs.find((j) => j.kind === "ideas");
  const waiting = sessions.filter((m) => m.ideas!.status === "asking").length;

  const start = (e: FormEvent) => {
    e.preventDefault();
    if (prompt.trim().length < 3 || searching) return;
    actions.askIdeas(prompt.trim());
    setPrompt("");
  };

  return (
    <div className="space-y-4">
      <PageIntro
        what="Tell Atlas what you want from your money. It asks a few questions, checks real prices, and suggests a few ideas you can try on paper first."
        now={
          searching
            ? "Atlas is working on it."
            : waiting
              ? `${waiting} ${waiting === 1 ? "search is" : "searches are"} waiting for your answers.`
              : sessions.length
                ? `${sessions.length} ${sessions.length === 1 ? "search" : "searches"} so far, ${placed} tried on paper.`
                : "Nothing asked yet."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>What are you looking for?</CardTitle>
          <CardDescription>Plain words are fine. You don’t need to know any finance. The ideas can be any real stock or fund, not just what you own.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={start} className="space-y-2">
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={MAX_PROMPT} placeholder="For example: I have 20k and want something safe-ish that pays dividends" aria-label="What you are looking for" className="resize-none" />
            <Button type="submit" disabled={prompt.trim().length < 3 || searching}>
              {searching ? "Working…" : "Find ideas"}
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="max-w-full rounded-full border border-white/12 bg-white/[0.07] px-3 py-1 text-left text-xs font-medium transition-colors hover:border-white/20 hover:bg-white/[0.12]"
              >
                {example}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Nothing is bought with real money.</p>
          {failed?.status === "failed" && !searching && <p className="text-sm text-live">That didn’t finish: {failed.error}</p>}
        </CardContent>
      </Card>

      {ideasRun && ideasRun.id === null && (
        <Card>
          <CardHeader>
            <CardTitle>Looking into it</CardTitle>
          </CardHeader>
          <CardContent>
            <IdeaStageRail events={ideasRun.events} />
          </CardContent>
        </Card>
      )}

      {tracking && tracking.tracked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ideas you tried on paper</CardTitle>
            <CardDescription>
              {tracking.total >= 0 ? "Up" : "Down"} {money(Math.abs(tracking.total))} in total at today’s prices. Practice money, nothing real.
            </CardDescription>
          </CardHeader>
          <Table>
            <thead>
              <tr>
                <Th>Idea</Th>
                <Th className="text-right">Put in</Th>
                <Th className="hidden text-right sm:table-cell">Now</Th>
                <Th className="text-right">Gain or loss</Th>
              </tr>
            </thead>
            <tbody>
              {tracking.tracked.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <a href={`#ideas/${t.messageId}`} className="font-semibold underline decoration-white/25 underline-offset-4 hover:decoration-white">
                      {t.ticker}
                    </a>
                    <div className="max-w-40 truncate text-xs text-muted-foreground">{t.name}</div>
                  </Td>
                  <Td className="text-right tabular-nums">{money(t.dollars)}</Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">{money(t.dollars + t.effect, 2)}</Td>
                  <Td className="text-right tabular-nums">
                    {t.effect >= 0 ? "+" : "−"}
                    {money(Math.abs(t.effect))} <span className="text-muted-foreground">({signedPct(t.effectPct)})</span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {sessions.map((m, i) => (
        <IdeaSessionCard key={`${m.id}${route.sub ?? ""}`} atlas={atlas} message={m} tracked={tracking?.tracked ?? []} defaultOpen={route.sub ? route.sub === m.id : i === 0} />
      ))}
    </div>
  );
}
