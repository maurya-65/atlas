"use client";

import { useState } from "react";
import { timeAgo } from "./format";
import { ResetIcon } from "./icons";
import type { ViewProps } from "./viewProps";
import { Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";

export function MemoryCard({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions } = atlas;
  return (
    <Card id="memory">
      <CardHeader>
        <CardTitle>What Atlas remembers</CardTitle>
        <CardDescription>One line from each answer in Chat, and from conversations in Claude, so later answers have context.</CardDescription>
        {state.memory.length > 0 && (
          <CardAction>
            <Button variant="outline" size="xs" onClick={actions.clearMemory}>
              Forget all
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {state.memory.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet. Ask Atlas a question in Chat and a note appears here.</p>
        ) : (
          <ul className="space-y-2.5">
            {[...state.memory].reverse().map((n) => (
              <li key={n.at}>
                {n.text}
                <span className="block text-xs text-muted-foreground">
                  {timeAgo(n.at)}
                  {n.from === "claude" && " · from Claude"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ResetCard({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions } = atlas;
  const [confirming, setConfirming] = useState(false);
  return (
    <Card id="reset">
      <CardHeader>
        <CardTitle>Start over and sign out</CardTitle>
      </CardHeader>
      <CardContent className="-my-3 divide-y divide-white/[0.07]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Clear everything Atlas has saved</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Chats, research, decisions, notes, topics and the paper account are cleared, and the rules go back to the defaults. Your brokerage stays
              connected.
            </p>
          </div>
          {confirming ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Clear everything?</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  actions.reset();
                }}
              >
                <ResetIcon />
                Yes, clear it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              <ResetIcon />
              Start over
            </Button>
          )}
        </div>
        {state.passwordProtected && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Sign out</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Atlas asks for the password again on this device.</p>
            </div>
            <Button variant="outline" size="sm" onClick={actions.signOut}>
              Sign out
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
