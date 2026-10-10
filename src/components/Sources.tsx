import type { SourceRef } from "@/lib/types";

function niceDate(d?: string) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString();
}

/** `numbered` shows each source's [n], matching the citations in research text. */
export default function Sources({ sources, max = 8, numbered = false }: { sources?: SourceRef[]; max?: number; numbered?: boolean }) {
  if (!sources?.length) return null;
  const shown = sources.slice(0, max);
  return (
    <details className="group/src mt-3 text-sm">
      <summary className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground">
        <span aria-hidden className="text-[10px] transition-transform group-open/src:rotate-90">
          &#9656;
        </span>
        Sources ({sources.length})
      </summary>
      <ul className="mt-2 space-y-1.5">
        {shown.map((s, i) => (
          <li key={i} className="leading-snug">
            {numbered && <span className="mr-1.5 font-mono text-xs text-muted-foreground">[{i + 1}]</span>}
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-4 hover:decoration-white">
                {s.title}
              </a>
            ) : (
              <span>{s.title}</span>
            )}
            {(s.publisher || s.date) && (
              <span className="text-xs text-muted-foreground">
                {" "}
                — {[s.publisher, niceDate(s.date)].filter(Boolean).join(", ")}
              </span>
            )}
          </li>
        ))}
        {sources.length > max && <li className="text-xs text-muted-foreground">and {sources.length - max} more</li>}
      </ul>
    </details>
  );
}
