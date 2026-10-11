"use client";

import { ListChecksIcon } from "./icons";
import { describeTrade, formatWhen, type PaperData } from "./paperData";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Empty } from "./ui";

interface Order {
  key: string;
  at: number;
  where: "Paper" | "Real";
  text: string;
  status: string;
  when: string;
}

/** Paper trades Atlas simulated, real orders Atlas placed through the brokerage, and the broker's own recent orders. */
function allOrders(data: PaperData): Order[] {
  const placed = data.trades.map((t) => ({
    key: t.id,
    at: new Date(t.createdAt).getTime(),
    where: t.mode === "paper" ? ("Paper" as const) : ("Real" as const),
    text: describeTrade(t),
    status: t.status,
    when: formatWhen(t.createdAt),
  }));
  const atBroker = data.brokerOrders.map((o, i) => ({
    key: `broker-${i}`,
    at: new Date(o.time).getTime() || 0,
    where: "Real" as const,
    text: `${o.action} ${o.quantity} ${o.ticker}`,
    status: o.status.toLowerCase(),
    when: o.time && !Number.isNaN(new Date(o.time).getTime()) ? formatWhen(o.time) : "",
  }));
  return [...placed, ...atBroker].sort((a, b) => b.at - a.at);
}

export default function OrdersTab({ data }: { data: PaperData | null }) {
  if (!data) return <p className="px-1 text-sm text-muted-foreground">Loading…</p>;
  const orders = allOrders(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>All orders</CardTitle>
        <CardDescription>Paper trades are practice. Real orders are the ones at your brokerage. Newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <Empty icon={<ListChecksIcon />} title="No orders yet">
            Trades you approve in Decisions, and orders at your brokerage, are listed here.
          </Empty>
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {orders.map((o) => (
              <li key={o.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Badge variant={o.where === "Paper" ? "paper" : "outline"}>{o.where}</Badge>
                <span className="min-w-40 flex-1">{o.text}</span>
                <span className="text-xs text-muted-foreground">{o.status}</span>
                {o.when && <span className="text-xs text-muted-foreground tabular-nums">{o.when}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
