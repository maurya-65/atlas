"use client";

import { useState } from "react";
import type { TrackedIdea } from "@/lib/ideas";
import type { ChatMessage, IdeaSession } from "@/lib/types";
import { timeAgo } from "./format";
import IdeaCard from "./IdeaCard";
import IdeaStageRail from "./IdeaStageRail";
import { Badge, Button, Card, CardAction, CardContent, CardHeader, CardTitle, Details, Eyebrow, Input, cn } from "./ui";
import type { Atlas } from "./useAtlas";

const YOU_DECIDE = "You decide";

/** The follow-up questions: tap an answer or type one, or leave it to Atlas. */
function Questions({ session, onSubmit, busy }: { session: IdeaSession; onSubmit: (answers: string[]) => void; busy: boolean }) {
  const [picked, setPicked] = useState<string[]>(() => session.questions.map(() => YOU_DECIDE));
  const [typed, setTyped] = useState<string[]>(() => session.questions.map(() => ""));
  const set = (list: string[], i: number, value: string) => list.map((x, j) => (j === i ? value : x));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(session.questions.map((_, i) => typed[i].trim() || (picked[i] === YOU_DECIDE ? "" : picked[i])));
      }}
    >
      <p className="text-sm text-muted-foreground">A few quick questions so the ideas fit you. Not sure about one? Leave it on “{YOU_DECIDE}”.</p>
      {session.questions.map((q, i) => (
        <fieldset key={q.text} className="space-y-2.5">
          <legend className="text-sm font-medium">{q.text}</legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={q.text}>
            {[...q.options, YOU_DECIDE].map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={picked[i] === option && !typed[i].trim()}
                onClick={() => {
                  setPicked(set(picked, i, option));
                  setTyped(set(typed, i, ""));
                }}
                className={cn(
                  "min-h-8 rounded-full border px-3.5 py-1 text-left text-sm transition-colors",
                  picked[i] === option && !typed[i].trim() ? "border-white/30 bg-white/[0.16] font-medium" : "border-white/12 text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <Input value={typed[i]} onChange={(e) => setTyped(set(typed, i, e.target.value))} placeholder="Or say it in your own words" maxLength={200} aria-label={`${q.text} (your own words)`} />
        </fieldset>
      ))}
      <Button type="submit" disabled={busy}>
        {busy ? "Working…" : "Show me ideas"}
      </Button>
    </form>
  );
}

function Result({ atlas, message, session, tracked }: { atlas: Atlas; message: ChatMessage; session: IdeaSession; tracked: TrackedIdea[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{session.summary}</p>
      {session.ideas.map((idea) => (
        <IdeaCard key={idea.ticker} atlas={atlas} messageId={message.id} idea={idea} tracked={tracked.find((t) => t.id === idea.trade?.id)} />
      ))}
      {(session.dropped.length > 0 || session.questions.length > 0) && (
        <Details label="how Atlas got here">
          {session.questions.length > 0 && (
            <div className="space-y-1.5">
              <Eyebrow>Your answers</Eyebrow>
              <ul className="space-y-1">
                {session.questions.map((q, i) => (
                  <li key={q.text}>
                    <span className="text-muted-foreground">{q.text}</span> {session.answers[i] || YOU_DECIDE}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {session.dropped.length > 0 && (
            <div className="space-y-1.5">
              <Eyebrow>Looked at and set aside</Eyebrow>
              <ul className="space-y-1">
                {session.dropped.map((d) => (
                  <li key={d.ticker}>
                    <span className="font-medium">{d.ticker}</span> <span className="text-muted-foreground">{d.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Details>
      )}
    </div>
  );
}

/** One Ideas search from start to end: the stage rail while it runs, the questions, then the ideas. */
export default function IdeaSessionCard({ atlas, message, tracked, defaultOpen }: { atlas: Atlas; message: ChatMessage; tracked: TrackedIdea[]; defaultOpen: boolean }) {
  const session = message.ideas!;
  const [open, setOpen] = useState(defaultOpen);
  const run = atlas.ideasRun && atlas.ideasRun.id === message.id ? atlas.ideasRun : null;
  const working = atlas.jobs.running.some((j) => j.kind === "ideas");
  const status = run ? "Working on it" : session.status === "asking" ? "Waiting for your answers" : session.ideas.length ? `${session.ideas.length} ${session.ideas.length === 1 ? "idea" : "ideas"}` : "Nothing convincing";

  return (
    <Card id={message.id}>
      <CardHeader>
        <CardTitle className="break-words">{session.prompt}</CardTitle>
        <CardAction className="flex items-center gap-2">
          <Badge variant={session.status === "asking" || run ? "decision" : "soft"}>{status}</Badge>
        </CardAction>
        <p className="text-xs text-muted-foreground">{timeAgo(message.createdAt)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {run ? (
          <IdeaStageRail events={run.events} />
        ) : !open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Open
          </Button>
        ) : session.status === "asking" ? (
          <Questions session={session} busy={working} onSubmit={(answers) => atlas.actions.answerIdeas(message.id, answers)} />
        ) : (
          <Result atlas={atlas} message={message} session={session} tracked={tracked} />
        )}
        {open && !run && session.status === "ready" && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
