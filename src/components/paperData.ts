import { useCallback, useEffect, useState } from "react";
import type { PaperAccount, PaperPerformance } from "@/lib/paper";
import type { Portfolio, TradeRecord } from "@/lib/types";
import { api } from "./format";

export interface PaperData {
  book: PaperAccount | null;
  /** Paper and real trades Atlas placed, newest first */
  trades: TradeRecord[];
  performance: PaperPerformance;
  brokerOrders: Portfolio["recentOrders"];
}

/**
 * Loads the paper account. It loads again when `approvals` changes, which is the number of receipts in the
 * saved cards: a new one means a trade was just approved.
 */
export function usePaperData(approvals: number) {
  const [data, setData] = useState<PaperData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<PaperData>("/api/paper"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data when the page opens or a trade is approved
    load();
  }, [load, approvals]);

  return { data, error, reload: load };
}

/** "Bought $20.00 of AAPL at about $180.50 a share (0.1108 shares)." */
export function describeTrade(t: TradeRecord): string {
  const verb = t.side === "BUY" ? "Bought" : "Sold";
  const price = t.price > 0 ? ` at about $${t.price.toFixed(2)} a share (${t.units.toFixed(4)} shares)` : "";
  return `${verb} $${t.dollars.toFixed(2)} of ${t.ticker}${price}`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
