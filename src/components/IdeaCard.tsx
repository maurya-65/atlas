"use client";

import { useEffect, useState } from "react";
import type { IdeaPreview, TrackedIdea } from "@/lib/ideas";
import type { IdeaSuggestion } from "@/lib/types";
import { api, money, pct, signedPct } from "./format";
import { Badge, Button, Eyebrow, Input } from "./ui";
import type { Atlas } from "./useAtlas";

const SWINGS = { calm: "Moves calmly", moderate: "Moves a fair bit", bumpy: "Swings a lot" } as const;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function Point({ label, children }: { label: string; children: string }) {
  return (
    <div className="space-y-0.5">
      <Eyebrow>{label}</Eyebrow>
      <p>{children}</p>
    </div>
  );
}

/** The paper order for one idea: what the portfolio looks like afterwards, then the order itself. */
function PaperOrder({ atlas, messageId, idea, onClose }: { atlas: Atlas; messageId: string; idea: IdeaSuggestion; onClose: () => void }) {
  const [amount, setAmount] = useState(String(idea.dollars));
  const [preview, setPreview] = useState<IdeaPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const dollars = Number(amount);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const out = await api<{ preview: IdeaPreview }>("/api/ideas", { action: "preview", id: messageId, ticker: idea.ticker, dollars: Number.isFinite(dollars) ? dollars : 0 });
        if (current) {
          setPreview(out.preview);
          setError(null);
        }
      } catch (e) {
        if (current) setError((e as Error).message);
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [messageId, idea.ticker, dollars]);

  const place = async () => {
    setPlacing(true);
    try {
      await api("/api/ideas", { action: "accept", id: messageId, ticker: idea.ticker, dollars });
      atlas.jobs.notify(`${idea.ticker} is in your paper account. You can follow how it does on the Ideas page.`, `#ideas/${messageId}`);
      await atlas.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlacing(false);
    }
  };

  const rows = preview && [
    ["Paper cash", pct(preview.cash.before), pct(preview.cash.after)],
    [`In ${idea.ticker}`, pct(preview.stock.before), pct(preview.stock.after)],
    [
      "Top holding",
      preview.biggest.before ? `${preview.biggest.before.ticker} ${pct(preview.biggest.before.share)}` : "none",
      preview.biggest.after ? `${preview.biggest.after.ticker} ${pct(preview.biggest.after.share)}` : "none",
    ],
  ];

  return (
    <div className="space-y-3 rounded-xl border border-white/15 bg-white/[0.05] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Paper amount
          <Input type="number" inputMode="decimal" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32 text-foreground" aria-label={`Paper dollars in ${idea.ticker}`} />
        </label>
        {preview && <p className="pb-2 text-xs text-muted-foreground">About {(preview.shares).toFixed(preview.shares < 10 ? 3 : 1)} shares at {money(preview.price)}</p>}
      </div>

      {rows && (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] text-sm">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-white/[0.08] px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>If you place it</span>
            <span className="text-right">Now</span>
            <span className="text-right">After</span>
          </div>
          {rows.map(([label, before, after]) => (
            <div key={label} className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1.5 tabular-nums">
              <span className="min-w-0 truncate">{label}</span>
              <span className="text-right text-muted-foreground">{before}</span>
              <span className="text-right font-medium">{after}</span>
            </div>
          ))}
        </div>
      )}

      {preview?.problems.map((p) => (
        <p key={p} className="text-sm text-live">
          {p}
          {preview.maxDollars >= 1 && preview.maxDollars !== dollars && (
            <>
              {" "}
              <button type="button" onClick={() => setAmount(String(preview.maxDollars))} className="font-medium underline underline-offset-4">
                Use {money(preview.maxDollars, 0)}
              </button>
            </>
          )}
        </p>
      ))}
      {preview?.flags.map((f) => (
        <p key={f} className="text-sm text-muted-foreground">
          Heads-up: {f}
        </p>
      ))}
      {error && <p className="text-sm text-live">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={place} disabled={placing || !preview || preview.problems.length > 0}>
          {placing ? "Placing…" : `Place ${money(dollars, 0)} paper order`}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={placing}>
          Not now
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Practice money only. Nothing real is bought, and your rules and limits are checked first.</p>
    </div>
  );
}

export default function IdeaCard({ atlas, messageId, idea, tracked }: { atlas: Atlas; messageId: string; idea: IdeaSuggestion; tracked?: TrackedIdea }) {
  const [ordering, setOrdering] = useState(false);
  const held = idea.heldNow > 0.0005;

  return (
    <article className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">{idea.ticker}</span>
          <Badge variant="soft">{idea.kind === "fund" ? "Fund" : "Stock"}</Badge>
          <Badge variant="paper" className="capitalize">
            {idea.area}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{idea.name}</p>
        <p className="pt-1 text-base leading-snug">{idea.reason}</p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Price" value={money(idea.price)} />
        <Fact label="Last month" value={signedPct(idea.move1m)} />
        <Fact label="Last 6 months" value={signedPct(idea.move6m)} />
        <Fact label="Below its yearly high" value={pct(idea.belowHigh, 0)} />
        <Fact label="Ride" value={SWINGS[idea.swings]} />
        <Fact label="Pays dividends" value={idea.yield ? `${pct(idea.yield)} a year` : "No"} />
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <Point label="What it is">{idea.whatItIs}</Point>
        <Point label="Main risk">{idea.risk}</Point>
        <Point label="What would make this wrong">{idea.wrongIf}</Point>
        <Point label="How it fits what you own">
          {[
            held ? `You already own ${pct(idea.heldNow)} of your portfolio in it.` : "You don’t own it yet.",
            idea.areaNow > 0.0005 ? `${pct(idea.areaNow)} of your portfolio is already in the same area (${idea.area}).` : "",
            idea.dollars > 0 ? `The suggested ${money(idea.dollars, 0)} would make it ${pct(idea.weightAfter)} of your portfolio.` : "",
            idea.fit,
          ]
            .filter(Boolean)
            .join(" ")}
        </Point>
      </div>

      {idea.trade ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm">
          <span>
            In your paper account: {money(idea.trade.dollars)} bought at {money(idea.trade.price)}.
          </span>
          <span className="font-medium tabular-nums">
            {tracked ? `${tracked.effect >= 0 ? "Up" : "Down"} ${money(Math.abs(tracked.effect))} (${signedPct(tracked.effectPct)})` : "Checking today’s price…"}
          </span>
        </div>
      ) : ordering ? (
        <PaperOrder atlas={atlas} messageId={messageId} idea={idea} onClose={() => setOrdering(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setOrdering(true)} disabled={idea.dollars < 1}>
            Try {money(idea.dollars, 0)} on paper
          </Button>
          <span className="text-xs text-muted-foreground">{idea.dollars < 1 ? "There isn’t room for this one in your paper account right now." : "See what your portfolio would look like first."}</span>
        </div>
      )}
    </article>
  );
}
