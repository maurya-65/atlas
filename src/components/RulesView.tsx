"use client";

import { useState } from "react";
import { ruleText } from "@/lib/types";
import { money } from "./format";
import { ListChecksIcon, XIcon } from "./icons";
import type { ViewProps } from "./Sections";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty, Input, Select } from "./ui";

type NewKind = "concentration" | "drawdown" | "idle_cash" | "price_below" | "price_above";

const KINDS: { id: NewKind; label: string; unit: "%" | "$" }[] = [
  { id: "concentration", label: "One stock gets too big a share of my portfolio", unit: "%" },
  { id: "drawdown", label: "A stock falls below what I paid for it", unit: "%" },
  { id: "idle_cash", label: "Too much of my portfolio is sitting in cash", unit: "%" },
  { id: "price_below", label: "A stock's price falls below a level", unit: "$" },
  { id: "price_above", label: "A stock's price rises above a level", unit: "$" },
];

function AddRule({ onAdd }: { onAdd: ViewProps["onAddRule"] }) {
  const [kind, setKind] = useState<NewKind>("concentration");
  const [limit, setLimit] = useState("");
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const unit = KINDS.find((k) => k.id === kind)!.unit;
  const byPrice = unit === "$";
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
          <Input
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder={byPrice ? "200" : "25"}
            className="mt-1 text-foreground"
          />
        </label>
        <Button type="submit" variant="outline" disabled={!ready || working}>
          {working ? "Adding…" : "Add rule"}
        </Button>
      </div>
      {ready && <p className="text-xs text-muted-foreground">Rule: {ruleText(kind, threshold, ticker.trim().toUpperCase())}</p>}
      {error && (
        <p className="text-sm text-live" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function RuleState({ hits }: { hits?: string[] }) {
  if (!hits) return <Badge variant="secondary">Couldn’t check just now</Badge>;
  if (hits.length === 0) return <Badge variant="up">Fine right now</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant="live">Crossed</Badge>
      <span className="text-xs">{hits.join("; ")}</span>
    </span>
  );
}

export default function RulesView({ state, onDeleteRule, onAddRule, onSetInterests }: ViewProps) {
  const [draft, setDraft] = useState("");
  const addTopic = async () => {
    const v = draft.trim();
    if (!v) return;
    if (!state.interests.some((i) => i.toLowerCase() === v.toLowerCase())) {
      await onSetInterests([...state.interests, v]);
    }
    setDraft("");
  };
  const hitsOf = new Map(state.ruleStatus.map((s) => [s.id, s.hits]));
  const { limits } = state;

  return (
    <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Your rules</CardTitle>
          <CardDescription>
            Each rule is checked against your portfolio just now, and again whenever you press Check now in the Inbox or the daily run happens. When a
            rule is crossed, a card appears in the Inbox. Nothing is bought or sold unless you click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.rules.length === 0 ? (
            <Empty icon={<ListChecksIcon />} title="No rules yet.">
              Add one below.
            </Empty>
          ) : (
            <ul className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08]">
              {state.rules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                  <div className="space-y-1.5">
                    <div>{r.text}</div>
                    <RuleState hits={hitsOf.get(r.id)} />
                    {r.action === "propose" && <Badge variant="soft">Also suggests a trade for your approval</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onDeleteRule(r.id)} aria-label={`Delete rule: ${r.text}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <AddRule onAdd={onAddRule} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:gap-5">
        <Card>
          <CardHeader>
            <CardTitle>News topics</CardTitle>
            <CardDescription>
              Atlas also reads news and government notices about these topics when you press Check now, even for companies you don’t own. Try
              “semiconductors” or “EV tariffs”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.interests.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {state.interests.map((i) => (
                  <li key={i} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] py-0.5 pr-1 pl-3">
                    {i}
                    <Button variant="ghost" size="xs" onClick={() => onSetInterests(state.interests.filter((x) => x !== i))} aria-label={`Stop following ${i}`} className="px-1">
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTopic();
              }}
              className="flex gap-2"
            >
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a topic…" aria-label="Add a news topic to follow" />
              <Button type="submit" variant="outline">
                Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Real-money limits</CardTitle>
            <CardDescription>Fixed in Atlas’s code, not settings you can change. They only matter in live mode; paper mode never uses real money.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Most per trade</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(limits.perTrade, 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Most per day</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(limits.perDay, 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Used today</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(limits.usedToday)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
