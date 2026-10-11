"use client";

import { useState } from "react";
import { ruleText, type Rule } from "@/lib/types";
import { timeAgo } from "./format";
import { ListChecksIcon } from "./icons";
import type { NewRule } from "./useAtlas";
import type { ViewProps } from "./viewProps";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input, Select } from "./ui";

type NewKind = "concentration" | "drawdown" | "idle_cash" | "price_below" | "price_above";

const KINDS: { id: NewKind; label: string; unit: "%" | "$" }[] = [
  { id: "concentration", label: "One stock gets too big a share of my portfolio", unit: "%" },
  { id: "drawdown", label: "A stock falls below what I paid for it", unit: "%" },
  { id: "idle_cash", label: "Too much of my portfolio is sitting in cash", unit: "%" },
  { id: "price_below", label: "A stock's price falls below a level", unit: "$" },
  { id: "price_above", label: "A stock's price rises above a level", unit: "$" },
];

function AddRule({ onAdd }: { onAdd: (rule: NewRule) => Promise<void> }) {
  const [kind, setKind] = useState<NewKind>("concentration");
  const [limit, setLimit] = useState("");
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const byPrice = KINDS.find((k) => k.id === kind)!.unit === "$";
  const threshold = Number(limit);
  const ready = limit.trim() !== "" && threshold > 0 && (!byPrice || ticker.trim() !== "");

  const submit = async () => {
    setWorking(true);
    setError(null);
    try {
      await onAdd({ kind, threshold, ...(byPrice ? { ticker: ticker.trim() } : {}) });
      setLimit("");
      setTicker("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-4 space-y-3 border-t border-white/[0.08] pt-4"
    >
      <h3 className="text-sm font-medium">Add a rule</h3>
      <label className="block text-xs text-muted-foreground">
        Tell me when
        <Select value={kind} onChange={(e) => setKind(e.target.value as NewKind)} className="mt-1 text-foreground">
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        {byPrice && (
          <label className="block w-28 text-xs text-muted-foreground">
            Ticker
            <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="TSLA" maxLength={10} className="mt-1 text-foreground" />
          </label>
        )}
        <label className="block w-28 text-xs text-muted-foreground">
          {byPrice ? "Price ($)" : "Limit (%)"}
          <Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={byPrice ? "200" : "25"} className="mt-1 text-foreground" />
        </label>
        <Button type="submit" variant="outline" disabled={!ready || working}>
          {working ? "Adding…" : "Add rule"}
        </Button>
      </div>
      {ready ? (
        <p className="text-xs text-muted-foreground">Rule: {ruleText(kind, threshold, ticker.trim().toUpperCase())}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{byPrice ? "Enter a ticker and a price to add the rule." : "Enter a limit, for example 25, to add the rule."}</p>
      )}
      {error && (
        <p className="text-sm text-live" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function RuleStatus({ hits }: { hits?: string[] }) {
  if (!hits) return <Badge variant="secondary">Couldn’t check just now</Badge>;
  if (hits.length === 0) return <Badge variant="up">Fine right now</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant="live">Crossed</Badge>
      <span className="text-xs">{hits.join("; ")}</span>
    </span>
  );
}

/** Topic rules ("news_watch") are shown with the news topics, so this list is only the portfolio and price rules. */
export const isPortfolioRule = (r: Rule) => r.kind !== "news_watch";

export default function RulesSection({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions } = atlas;
  const rules = state.rules.filter(isPortfolioRule);
  const hitsOf = new Map(state.ruleStatus.map((s) => [s.id, s.hits]));
  const lastCheck = state.daily?.lastRunAt && (!state.lastScanAt || state.daily.lastRunAt > state.lastScanAt) ? state.daily.lastRunAt : state.lastScanAt;

  return (
    <Card id="rules">
      <CardHeader>
        <CardTitle>Rules</CardTitle>
        <CardDescription>
          The status on each rule is worked out from your portfolio every time this page loads. A card is only added to Decisions when you press Check now or
          the morning check runs{lastCheck ? ` (last time: ${timeAgo(lastCheck)})` : ""}. Nothing is bought or sold unless you click.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <Empty icon={<ListChecksIcon />} title="No rules yet.">
            Add one below.
          </Empty>
        ) : (
          <ul className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08]">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                <div className="space-y-1.5">
                  <div>{r.text}</div>
                  <RuleStatus hits={hitsOf.get(r.id)} />
                  {r.action === "propose" && <Badge variant="soft">Also suggests a trade for your approval</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => actions.deleteRule(r.id)} aria-label={`Remove rule: ${r.text}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <AddRule onAdd={actions.addRule} />
      </CardContent>
    </Card>
  );
}
