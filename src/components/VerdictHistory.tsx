import { STANCE_LABEL, type VerdictPoint } from "./derive";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function change(older: VerdictPoint, newer: VerdictPoint): string {
  if (older.stance !== newer.stance) return `Atlas moved from “${STANCE_LABEL[older.stance]}” to “${STANCE_LABEL[newer.stance]}”.`;
  if (newer.score === older.score) return "The verdict is the same as last time.";
  return `Same verdict as last time, with ${newer.score > older.score ? "more" : "less"} confidence (${older.score} to ${newer.score} out of 100).`;
}

/** How Atlas's verdict on a company changed from one research to the next. */
export default function VerdictHistory({ verdicts }: { verdicts: VerdictPoint[] }) {
  const newestFirst = [...verdicts].reverse();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Verdict over time</CardTitle>
        <CardDescription>{verdicts.length > 1 ? change(verdicts[verdicts.length - 2], verdicts[verdicts.length - 1]) : "Research it again later to see how the verdict changes."}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-white/[0.07]">
          {newestFirst.map((v) => (
            <li key={v.messageId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span className="text-muted-foreground tabular-nums">{date(v.at)}</span>
              <span className="flex-1 font-medium">{STANCE_LABEL[v.stance]}</span>
              <span className="text-xs text-muted-foreground">
                {v.score ? `${v.score}/100 · ` : ""}
                {v.via === "claude" ? "Research in Claude" : "Atlas"}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
