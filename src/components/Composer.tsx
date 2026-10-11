"use client";

import { useEffect, useRef, useState } from "react";

const MAX_QUESTION = 500;

/** The question box under a chat. Enter sends, Shift+Enter starts a new line. */
export default function Composer({ onAsk, busy }: { onAsk: (question: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = () => {
    const question = text.trim();
    if (!question || busy) return;
    onAsk(question);
    setText("");
    ref.current?.focus();
  };

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="glass-strong flex items-end gap-2 rounded-[1.75rem] p-2 transition-colors focus-within:border-white/25"
      >
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={MAX_QUESTION}
          placeholder="Ask about your portfolio or an investing term…"
          aria-label="Your question"
          aria-describedby="ask-atlas-hint"
          className="block max-h-52 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Ask"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-white/85 active:translate-y-px disabled:bg-white/15 disabled:text-white/40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-[18px]">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </form>
      <p id="ask-atlas-hint" className="mt-2 hidden px-3 text-center text-[11px] text-muted-foreground sm:block">
        A quick answer from your holdings and what Atlas remembers. For a full research or a what-if, use{" "}
        <a href="#research/new" className="underline decoration-white/25 underline-offset-4 hover:decoration-white">
          Research
        </a>
        .
      </p>
    </div>
  );
}
