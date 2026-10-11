import type { Stance } from "@/lib/types";
import { STANCE_LABEL } from "./derive";
import { Badge } from "./ui";

/** A verdict as a small tag, with its 0-100 confidence when the research has one. */
export default function VerdictTag({ stance, score }: { stance: Stance; score?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant="soft">{STANCE_LABEL[stance]}</Badge>
      {score ? <span className="text-xs text-muted-foreground tabular-nums">{score}/100</span> : null}
    </span>
  );
}
