"use client";

import { useState } from "react";
import type { CardOption } from "@/lib/types";
import { buttonClass } from "./ui";
import { useExtensionReady } from "./useExtensionReady";

/**
 * Option buttons for a decision, in one row. The recommended option is shown first (white), the others are
 * glass; onChoose always receives the option's position in the original `options` array.
 */
export default function DecisionOptions({
  messageId,
  options,
  resolved,
  onChoose,
  disabled,
}: {
  messageId: string;
  options?: CardOption[];
  resolved?: string;
  onChoose: (messageId: string, optionIndex: number) => Promise<void>;
  disabled: boolean;
}) {
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedClaude, setOpenedClaude] = useState(false);
  const extensionReady = useExtensionReady();
  // "Deep research in Claude" only shows once the extension is set up.
  const indexed = (options ?? []).map((o, i) => ({ ...o, index: i })).filter((o) => extensionReady || o.kind !== "open_claude");
  const ordered = [...indexed.filter((o) => o.recommended), ...indexed.filter((o) => !o.recommended)];

  async function choose(i: number) {
    setPendingIdx(i);
    setError(null);
    try {
      await onChoose(messageId, i);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingIdx(null);
    }
  }

  if (resolved) {
    return (
      <p className="mt-3 text-sm">
        <span className="text-muted-foreground">You chose:</span> {resolved}
      </p>
    );
  }
  if (!ordered.length) return null;

  // Say exactly which buttons are simulated, so a pretend trade is never confused with a real one.
  const trades = ordered.filter((o) => o.kind === "approve_trade");
  const paperTrades = trades.filter((o) => Boolean(o.payload?.paper));
  const paperNote =
    paperTrades.length === 0
      ? null
      : paperTrades.length === trades.length
        ? "Paper trades: no real money moves, even in live mode."
        : `Paper trades (no real money, even in live mode): ${paperTrades.map((o) => o.label).join("; ")}.`;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ordered.map((o) =>
          o.kind === "open_claude" && o.payload?.url ? (
            // A plain link: Claude Deep Research runs on the user's Claude plan, not Atlas's API key.
            <a
              key={o.index}
              href={o.payload.url}
              target="_blank"
              rel="noreferrer"
              data-atlas-claude
              onClick={() => setOpenedClaude(true)}
              className={buttonClass("outline", "option")}
            >
              {/* Cards saved before the label was shortened still carry a bracketed note; leave it out. */}
              {o.label.replace(/\s*\(.*\)\s*$/, "")} ↗
            </a>
          ) : (
            <button
              key={o.index}
              type="button"
              onClick={() => choose(o.index)}
              disabled={disabled || pendingIdx !== null}
              title={o.recommended ? "Recommended" : undefined}
              className={buttonClass(o.recommended ? "default" : "outline", "option")}
            >
              {pendingIdx === o.index ? "Working…" : o.label}
              {o.recommended && <span className="sr-only"> (recommended)</span>}
            </button>
          ),
        )}
      </div>
      {paperNote && <p className="mt-2 text-xs text-muted-foreground">{paperNote}</p>}
      {openedClaude && (
        <p className="mt-2 text-sm text-muted-foreground">
          In the Claude tab, check the prompt and press send. Keep that tab open: when the research finishes (about 10 minutes), the card appears in your Inbox by itself.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-live">That didn’t go through: {error}</p>}
    </>
  );
}
