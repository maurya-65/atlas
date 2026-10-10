"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ExternalIcon } from "./icons";
import { cn } from "./ui";

// No free-form chat here on purpose: every request in the web app costs API credits, so the box only does
// the two research jobs. It looks like a chat composer; conversation itself happens in the Claude app
// through the Atlas MCP server.
type ComposerMode = "whatif" | "research" | "sector";

const WHAT_IF_SUGGESTIONS = [
  "What if Tesla cuts prices again?",
  "What if new crypto regulation hits Bitcoin?",
  "What if Apple loses its App Store fees?",
];

// Only used when the portfolio has no holdings to suggest.
const RESEARCH_SUGGESTIONS = ["NVDA", "AAPL", "TSLA"];
const SECTOR_SUGGESTIONS = ["Semiconductors", "Electric vehicles", "Banks"];

const TICKER = /^[A-Z.\-]{1,10}$/;

const MODES: [ComposerMode, string][] = [
  ["research", "Research a stock"],
  ["sector", "Research a sector"],
  ["whatif", "What if"],
];

const CHIP =
  "min-h-8 max-w-full rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-left text-xs text-muted-foreground backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

/** "Ask Atlas": a chat-style box docked under the feed. Pick the job, type, send; results arrive in the feed. */
export default function Composer({
  onWhatIf,
  onResearch,
  onSector,
  onReview,
  onScan,
  canReview,
  claudeLinkFor,
  claudeSectorLinkFor,
  tickers,
  busy,
  inputRef,
}: {
  onWhatIf: (scenario: string) => void;
  onResearch: (ticker: string) => void;
  onSector: (sector: string) => void;
  onReview: () => void;
  onScan: () => void;
  /** False when there are no real holdings to review */
  canReview: boolean;
  /** claude.ai link with a Deep Research prompt for this ticker */
  claudeLinkFor: (ticker: string) => string;
  /** claude.ai link with a Deep Research prompt for a whole sector */
  claudeSectorLinkFor: (sector: string) => string;
  /** The user's biggest holdings, suggested for research */
  tickers: string[];
  busy: boolean;
  /** Lets the page focus the box (the header's "Ask Atlas" button) */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("whatif");
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;

  // Typing is free in every mode. In research mode the ticker is picked out of what was typed:
  // a holding if one is named ("research MSFT please"), otherwise a single word on its own ("nvda").
  const tickerFrom = (value: string) => {
    const words = value.toUpperCase().replace(/[^A-Z.\-\s]/g, " ").split(/\s+/).filter(Boolean);
    return words.find((w) => tickers.includes(w)) ?? (words.length === 1 ? words[0] : "");
  };
  const ticker = tickerFrom(text);
  const valid = mode === "research" ? TICKER.test(ticker) : Boolean(text.trim());

  // Grow with the text, up to a few lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text, mode, ref]);

  const send = (value: string, as: ComposerMode = mode) => {
    const v = value.trim();
    if (!v || busy) return;
    if (as === "whatif") onWhatIf(v);
    else if (as === "sector") onSector(v);
    else {
      const sym = tickerFrom(v);
      if (!TICKER.test(sym)) return;
      onResearch(sym);
    }
    setText("");
    ref.current?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      {!text && (
        <div className="mb-2.5 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Suggestions">
          {mode === "whatif"
            ? WHAT_IF_SUGGESTIONS.slice(0, 2).map((s) => (
                <button key={s} type="button" onClick={() => send(s, "whatif")} disabled={busy} className={CHIP}>
                  {s}
                </button>
              ))
            : (mode === "sector" ? SECTOR_SUGGESTIONS : tickers.length ? tickers : RESEARCH_SUGGESTIONS).map((s) => (
                <button key={s} type="button" onClick={() => send(s, mode)} disabled={busy} className={CHIP}>
                  Research {s}
                </button>
              ))}
          <button
            type="button"
            onClick={onReview}
            disabled={busy || !canReview}
            title={canReview ? "Deep research on your 3 biggest holdings" : "Needs real holdings: connect a brokerage first"}
            className={CHIP}
          >
            Review my portfolio
          </button>
          <button
            type="button"
            onClick={onScan}
            disabled={busy}
            title="Check your holdings and topics against your rules, the latest news, SEC filings and government notices"
            className={CHIP}
          >
            Scan now
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="glass-strong rounded-[1.75rem] p-2 transition-colors focus-within:border-white/25"
      >
        <textarea
          ref={ref}
          id="ask-atlas"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={1}
          maxLength={500}
          placeholder={mode === "research" ? `Type a ticker, like ${tickers[0] ?? "AAPL"}` : mode === "sector" ? "Type a sector, like Semiconductors" : "Ask a what-if…"}
          aria-label={mode === "whatif" ? "Ask Atlas: describe a what-if scenario" : "Ask Atlas: a ticker symbol to research"}
          aria-describedby="ask-atlas-hint"
          className="block max-h-52 w-full resize-none bg-transparent px-3 pt-2.5 pb-1.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div role="radiogroup" aria-label="What Atlas should do" className="flex min-w-0 flex-wrap items-center gap-1.5">
            {MODES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => {
                  setMode(value);
                  setText("");
                  ref.current?.focus();
                }}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors",
                  mode === value
                    ? "border-white/25 bg-white/[0.14] text-foreground"
                    : "border-white/10 text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Always visible in research mode so the Claude hand-off is easy to find; it becomes a link once a ticker is typed. */}
          {mode !== "whatif" &&
            (valid ? (
              <a
                href={mode === "sector" ? claudeSectorLinkFor(text.trim()) : claudeLinkFor(ticker)}
                target="_blank"
                rel="noreferrer"
                {...(mode === "research" ? { "data-atlas-claude": "" } : {})}
                title="Opens Claude with the research prompt filled in"
                className="ml-auto inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-3 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.22]"
              >
                <span className="truncate">Deep research in Claude</span>
                <ExternalIcon className="size-3 shrink-0" />
              </a>
            ) : (
              <span
                title={mode === "sector" ? "Type a sector first" : "Type a ticker first"}
                className="ml-auto inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-muted-foreground/60"
              >
                <span className="truncate">Deep research in Claude</span>
                <ExternalIcon className="size-3 shrink-0" />
              </span>
            ))}
          <button
            type="submit"
            disabled={busy || !valid}
            aria-label={mode === "whatif" ? "Run what-if" : mode === "sector" ? "Research sector" : "Research"}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/85 active:translate-y-px disabled:bg-white/15 disabled:text-white/40",
              mode === "whatif" ? "ml-auto" : "",
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-[18px]">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
      <p id="ask-atlas-hint" className="mt-2 px-3 text-center text-[11px] text-muted-foreground">
        {mode === "whatif"
          ? "Describe an event and Atlas traces how it could reach your stocks."
          : mode === "sector"
            ? "Name a sector like semiconductors and Atlas checks what is happening in it and what it means for your stocks."
            : `Type a ticker like ${tickers[0] ?? "AAPL"} and Atlas reads its SEC filings, news and government notices.`}
      </p>
    </div>
  );
}
