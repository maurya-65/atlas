import type { ChatMessage, DailyState, Mode, Portfolio, Rule } from "@/lib/types";
import { Fragment, type ReactNode } from "react";

export interface AppState {
  mode: Mode;
  interests: string[];
  rules: Rule[];
  messages: ChatMessage[];
  portfolio: Portfolio | null;
  snaptradeConfigured: boolean;
  connected: boolean;
  accounts: { id: string; name: string; institution: string; isPaper: boolean }[];
  selectedAccountId: string | null;
  limits: { perTrade: number; perDay: number; usedToday: number };
  lastScanAt: string | null;
  daily?: DailyState;
  /** Why the brokerage portfolio couldn't be loaded, in plain words (sent by /api/state when it fails) */
  portfolioError?: string | null;
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Something went wrong (status ${res.status}).`;
    throw new Error(msg);
  }
  return data as T;
}

/**
 * POST and read a newline-delimited JSON stream (see ndjsonStream on the server): calls onEvent for each
 * progress event and resolves with the final result.
 */
export async function streamApi<E, T = unknown>(path: string, body: unknown, onEvent: (e: E) => void): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Something went wrong (status ${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { type: "event"; event: E } | { type: "done"; result: T } | { type: "error"; error: string };
      if (msg.type === "event") onEvent(msg.event);
      else if (msg.type === "done") return msg.result;
      else throw new Error(msg.error);
    }
    if (done) break;
  }
  throw new Error("The connection closed before the research finished. Its card may still appear after a refresh.");
}

export function money(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** "+12.3%" / "−4.0%" with a real minus sign; the sign carries the meaning, not colour. */
export function signedPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return "—";
  if (Math.abs(fraction) < 0.0005) return "0%";
  return `${fraction < 0 ? "−" : "+"}${(Math.abs(fraction) * 100).toFixed(digits)}%`;
}

/** Markdown reduced to one run of plain text, for one- and two-line summaries. */
export function plainText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "up 12.3% from what you paid" style, no colour needed. */
export function changeInWords(pnlPct: number | null): string {
  if (pnlPct === null || pnlPct === undefined) return "cost unknown";
  if (Math.abs(pnlPct) < 0.0005) return "even";
  return pnlPct > 0 ? `up ${pct(pnlPct)}` : `down ${pct(Math.abs(pnlPct))}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function inline(text: string): ReactNode[] {
  // **bold** only; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** Minimal markdown: paragraphs, line breaks, **bold**, "- " bullets. */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  // Headings and horizontal rules become their own blocks.
  const blocks = text
    .trim()
    .replace(/^(#{1,6}\s.*|-{3,})$/gm, "\n$1\n")
    .split(/\n{2,}/)
    .filter((b) => b.trim() && !/^-{3,}$/.test(b.trim()));
  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const heading = lines.length === 1 ? /^(#{1,6})\s+(.*)$/.exec(lines[0]) : null;
        if (heading) {
          return (
            <p
              key={bi}
              role="heading"
              aria-level={Math.min(6, heading[1].length + 3)}
              className={heading[1].length <= 2 ? "pt-2 text-base font-semibold" : "pt-1 font-semibold"}
            >
              {inline(heading[2].replace(/\*\*/g, ""))}
            </p>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>
              ))}
            </ol>
          );
        }
        const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {/^\s*[-*•]\s+/.test(l) ? <>• {inline(l.replace(/^\s*[-*•]\s+/, ""))}</> : inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5 text-sm text-card-foreground sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
