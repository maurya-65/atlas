"use client";

import { useState } from "react";
import { XIcon } from "./icons";
import type { ViewProps } from "./viewProps";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "./ui";

interface Topic {
  name: string;
  /** Set when the topic is a news rule rather than a plain topic */
  ruleId?: string;
}

export default function TopicsSection({ atlas }: Pick<ViewProps, "atlas">) {
  const { state, actions } = atlas;
  const [draft, setDraft] = useState("");

  const topics: Topic[] = [
    ...state.interests.map((name) => ({ name })),
    ...state.rules.filter((r) => r.kind === "news_watch" && r.topic).map((r) => ({ name: r.topic!, ruleId: r.id })),
  ];

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    if (!topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) await actions.setTopics([...state.interests, name]);
    setDraft("");
  };

  const remove = (topic: Topic) => (topic.ruleId ? actions.deleteRule(topic.ruleId) : actions.setTopics(state.interests.filter((i) => i !== topic.name)));

  return (
    <Card id="topics">
      <CardHeader>
        <CardTitle>Topics you follow</CardTitle>
        <CardDescription>
          Atlas reads news and government notices about these when it checks, even for companies you don’t own. Try “semiconductors” or “EV tariffs”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topics.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <li key={t.name} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] py-0.5 pr-1 pl-3">
                {t.name}
                <Button variant="ghost" size="xs" onClick={() => remove(t)} aria-label={`Stop following ${t.name}`} className="px-1">
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex gap-2"
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a topic…" aria-label="Add a topic to follow" />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
