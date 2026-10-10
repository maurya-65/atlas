"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Mode } from "@/lib/types";
import { money, type AppState } from "./format";
import { Badge, Button, Input } from "./ui";

export type SwitchMode = (mode: Mode, confirm?: string) => Promise<void>;

/** Paper / live as one compact settings row, with the switch. Going live needs LIVE typed in a confirmation. */
export default function ModeControl({ state, onSwitch }: { state: AppState; onSwitch: SwitchMode }) {
  const [dialog, setDialog] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { limits } = state;
  const isLive = state.mode === "live";

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDialog(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  async function goLive() {
    setPending(true);
    setError(null);
    try {
      await onSwitch("live", typed.trim());
      setDialog(false);
      setTyped("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function goPaper() {
    setPending(true);
    setError(null);
    try {
      await onSwitch("paper");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" role="status">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">
            Money mode
            <Badge variant={isLive ? "live" : "paper"}>{isLive ? "Live · real money" : "Paper · simulated"}</Badge>
          </div>
          <p className={isLive ? "mt-0.5 text-xs text-live" : "mt-0.5 text-xs text-muted-foreground"}>
            {isLive
              ? `Trades you approve use real money. Max ${money(limits.perTrade, 0)} per trade, ${money(limits.perDay, 0)} per day (${money(limits.usedToday)} used today).`
              : "Nothing real is traded."}
          </p>
          {error && !dialog && <p className="mt-1 text-xs text-live">Couldn’t switch: {error}</p>}
        </div>
        {isLive ? (
          <Button variant="outline" size="sm" onClick={goPaper} disabled={pending}>
            Back to paper
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDialog(true);
              setError(null);
            }}
            aria-haspopup="dialog"
          >
            Switch to real money…
          </Button>
        )}
      </div>

      {/* In a portal: glass panes use backdrop-filter, which would trap a fixed overlay inside the card. */}
      {dialog && !isLive && createPortal(
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="live-title">
          <button type="button" aria-label="Cancel" onClick={() => setDialog(false)} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" />
          <div className="glass-strong relative w-full max-w-md rounded-3xl border-live/40 p-6 text-sm">
            <h2 id="live-title" className="text-base font-semibold">
              Turn on live mode?
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Trades you approve will be sent to your real brokerage account through SnapTrade and use real money.</li>
              <li>
                Every trade is capped at {money(limits.perTrade, 0)}, and no more than {money(limits.perDay, 0)} in total per day.
              </li>
              <li>Atlas still never trades on its own — each trade needs you to press Approve.</li>
              <li>You can switch back to paper mode at any time with one click.</li>
            </ul>
            {!state.connected && (
              <p className="mt-3 rounded-xl bg-live-soft px-3 py-2 text-live">You need to connect a brokerage account first (see Brokerage account on this page).</p>
            )}
            <label className="mt-4 block" htmlFor="live-confirm">
              Type <span className="font-mono font-semibold">LIVE</span> to confirm
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Input
                id="live-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && typed.trim() === "LIVE" && goLive()}
                className="w-32 font-mono"
                placeholder="LIVE"
                autoFocus
              />
              <Button variant="live" onClick={goLive} disabled={typed.trim() !== "LIVE" || pending}>
                {pending ? "Switching…" : "Use real money"}
              </Button>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
            </div>
            {error && <p className="mt-2 text-live">Couldn’t switch: {error}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
