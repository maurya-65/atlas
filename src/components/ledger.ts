import type { CardOption, ChatMessage } from "@/lib/types";
import { companyHref } from "./views";

export interface Outcome {
  text: string;
  href?: string;
  linkLabel?: string;
}

/** A card the user answered, or a trade receipt with no card behind it. `at` is when it happened, as best we know. */
export type LedgerEntry =
  | { kind: "decision"; message: ChatMessage; choice: CardOption | null; outcome: Outcome; at: string }
  | { kind: "trade"; message: ChatMessage; at: string };

const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt);

function mentions(text: string, ticker?: string): boolean {
  if (!ticker) return false;
  const escaped = ticker.replace(/[.-]/g, (ch) => "\\" + ch);
  return new RegExp("\\b" + escaped + "\\b").test(text);
}

function outcomeOf(choice: CardOption | null, receipt: ChatMessage | null): Outcome {
  switch (choice?.kind) {
    case "approve_trade":
      if (!receipt) return { text: "Approved." };
      return receipt.mode === "live"
        ? { text: "A real order was sent to your brokerage.", href: "#portfolio/orders", linkLabel: "See your orders" }
        : { text: "Simulated in your paper account. No real money moved.", href: "#portfolio/paper", linkLabel: "See your paper account" };
    case "research": {
      const ticker = choice.payload?.ticker;
      return ticker ? { text: `Research on ${ticker} was started.`, href: companyHref(ticker), linkLabel: `Open ${ticker} in Research` } : { text: "Research was started." };
    }
    case "what_if":
      return { text: "A what-if was started.", href: "#research/scenarios", linkLabel: "Open the what-ifs" };
    case "add_interest":
      return { text: `Atlas now follows “${choice.payload?.topic ?? "this topic"}”.`, href: "#watching", linkLabel: "See what Atlas watches" };
    case "dismiss":
      return { text: "Dismissed." };
    default:
      return { text: "Decided." };
  }
}

/**
 * The decisions the user has made, newest first, each with what came of it. A trade card is paired with the
 * first unclaimed receipt for that ticker made after the card; receipts nothing claims stand on their own.
 */
export function ledger(decided: ChatMessage[], receipts: ChatMessage[]): LedgerEntry[] {
  const unclaimed = new Map(receipts.map((r) => [r.id, r]));
  const oldestReceiptsFirst = [...receipts].sort(byTime);
  const entries: LedgerEntry[] = [];

  for (const card of [...decided].sort(byTime)) {
    const choice = card.options?.find((o) => o.label === card.resolved) ?? null;
    let receipt: ChatMessage | null = null;
    if (choice?.kind === "approve_trade") {
      receipt = oldestReceiptsFirst.find((r) => unclaimed.has(r.id) && r.createdAt >= card.createdAt && mentions(r.text, choice.payload?.ticker)) ?? null;
      if (receipt) unclaimed.delete(receipt.id);
    }
    entries.push({ kind: "decision", message: card, choice, outcome: outcomeOf(choice, receipt), at: receipt?.createdAt ?? card.createdAt });
  }
  for (const receipt of unclaimed.values()) entries.push({ kind: "trade", message: receipt, at: receipt.createdAt });

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
