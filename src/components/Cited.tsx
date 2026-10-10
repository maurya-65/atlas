import type { ReactNode } from "react";
import type { SourceRef } from "@/lib/types";

/** Text with [n] citations turned into links to the numbered sources (sources[n - 1]). */
export default function Cited({ text, sources }: { text: string; sources: (SourceRef | undefined)[] }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    const src = sources[n - 1];
    if (!src?.url) continue;
    const at = m.index ?? 0;
    parts.push(text.slice(last, at));
    parts.push(
      <a
        key={`${at}-${n}`}
        href={src.url}
        target="_blank"
        rel="noreferrer"
        title={`${src.title}${src.publisher ? ` (${src.publisher})` : ""}`}
        className="mx-px align-super text-[0.7em] font-medium text-muted-foreground hover:text-foreground hover:underline"
      >
        [{n}]
      </a>,
    );
    last = at + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
