"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ExternalIcon } from "./icons";
import { cn } from "./ui";

type ComposerMode = "ask" | "research" | "sector" | "whatif";

const TICKER = /^[A-Z.\-]{1,10}$/;

const MODES: [ComposerMode, string][] = [
  ["ask", "Ask"],
  ["research", "Research a stock"],
  ["sector", "Research a sector"],
  ["whatif", "What if"],
];

/** The box under a chat. Pick what Atlas should do with what you type; Ask is the default. */
export default function Composer({
  onAsk,
  onResearch,
  onSector,
  onWhatIf,
  claudeLinkFor,
  claudeSectorLinkFor,
  tickers,
  busy,
  inputRef,
}: {
  onAsk: (question: string) => void;
  onResearch: (ticker: string) => void;
  onSector: (sector: string) => void;
  onWhatIf: (scenario: string) => void;
  /** claude.ai link with a Deep Research prompt for this ticker */
  claudeLinkFor: (ticker: string) => string;
  /** claude.ai link with a Deep Research prompt for a whole sector */
  claudeSectorLinkFor: (sector: string) => string;
  /** The user's biggest holdings, to recognise one named in a sentence */
  tickers: string[];
  busy: boolean;
  /** Lets the page focus the box (the header's "Ask Atlas" button) */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("ask");
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;

  // In research mode the ticker is picked out of what was typed: a holding if one is named
  // ("research MSFT please"), otherwise a single word on its own ("nvda").
  const tickerFrom = (value: string) => {
    const words = value.toUpperCase().replace(/[^A-Z.\-\s]/g, " ").split(/\s+/).filter(Boolean);
    return words.find((w) => tickers.includes(w)) ?? (words.length === 1 ? words[0] : "");
  };
  const ticker = tickerFrom(text);
  const valid = mode === "research" ? TICKER.test(ticker) : Boolean(text.trim());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text, mode, ref]);

  const send = () => {
    const v = text.trim();
    if (!v || busy) return;
    if (mode === "ask") onAsk(v);
    else if (mode === "whatif") onWhatIf(v);
    else if (mode === "sector") onSector(v);
    else {
      if (!TICKER.test(ticker)) return;
      onResearch(ticker);
    }
    setText("");
    ref.current?.focus();
  };

  const example = tickers[0] ?? "AAPL";
  const placeholder = {
    ask: "Ask about your portfolio or an investing term…",
    research: `Type a ticker, like ${example}`,
    sector: "Type a sector, like Semiconductors",
    whatif: "Describe an event, like “What if Tesla cuts prices again?”",
  }[mode];
  const hint = {
    ask: "A quick answer from your holdings and what Atlas remembers. It doesn't read the news; use Research for that.",
    research: `Atlas reads filings, news and the web about a stock and gives a verdict. Type a ticker like ${example}.`,
    sector: "Atlas checks what is happening in a sector and what it means for your stocks.",
    whatif: "Describe an event and Atlas traces how it could reach your stocks.",
  }[mode];

  const claudeLink = mode === "research" || mode === "sector";

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
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
              send();
            }
          }}
          rows={1}
          maxLength={500}
          placeholder={placeholder}
          aria-label="Message Atlas"
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
          {/* Always visible in the research modes so the Claude hand-off is easy to find; it becomes a link once there is something to research. */}
          {claudeLink &&
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
            aria-label={mode === "ask" ? "Ask" : mode === "whatif" ? "Run what-if" : mode === "sector" ? "Research sector" : "Research"}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/85 active:translate-y-px disabled:bg-white/15 disabled:text-white/40",
              claudeLink ? "" : "ml-auto",
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-[18px]">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
      <p id="ask-atlas-hint" className="mt-2 hidden px-3 text-center text-[11px] text-muted-foreground sm:block">
        {hint}
      </p>
    </div>
  );
}
