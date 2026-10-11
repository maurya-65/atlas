"use client";

import { useEffect, useRef } from "react";
import { ChatStart, ThreadList } from "./Chat";
import ChatLinkCard from "./ChatLinkCard";
import Composer from "./Composer";
import { MessageView, Thinking } from "./Messages";
import type { ViewProps } from "./viewProps";
import { goTo, threadFromRoute } from "./views";

/** Questions and answers. Research and what-ifs started here keep their result on the Research page. */
export default function ChatView({ atlas, route }: ViewProps) {
  const { state, actions } = atlas;
  const activeChat = threadFromRoute(route);
  const messages = state.messages.filter((m) => m.threadId && m.threadId === activeChat);
  const thinking = activeChat !== null && atlas.asking === activeChat;
  const busy = atlas.asking !== null || atlas.choosing !== null;
  const scrollRef = useRef<HTMLDivElement>(null);

  // A chat opens at its newest message; the start screen stays at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = messages.length > 0 ? el.scrollHeight : 0;
  }, [activeChat, messages.length, thinking]);

  const ask = (question: string) => {
    const threadId = activeChat ?? crypto.randomUUID();
    if (!activeChat) goTo(`chat/${threadId}`);
    return actions.ask(question, threadId);
  };

  const deleteChat = async (threadId: string) => {
    await actions.deleteChat(threadId);
    if (threadId === activeChat) goTo("chat");
  };

  return (
    <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      <ThreadList threads={state.threads} activeId={activeChat} onDelete={deleteChat} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 sm:px-5" aria-live="polite">
          <section aria-label="Chat" className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3 py-4">
            {messages.length === 0 && !thinking ? (
              <ChatStart disabled={busy} onAsk={ask} />
            ) : (
              messages.map((m) =>
                m.kind === "research" || m.kind === "scenario" ? (
                  <ChatLinkCard key={m.id} m={m} />
                ) : (
                  <MessageView key={m.id} m={m} busy={busy} onChoose={(id, i) => actions.choose(id, i, { threadId: activeChat ?? undefined })} />
                ),
              )
            )}
            {thinking && (
              <div className="px-1 py-2">
                <Thinking label="Thinking…" />
              </div>
            )}
          </section>
        </div>
        <div className="min-w-0 shrink-0 px-3 pt-2 pb-3 sm:px-5">
          <Composer onAsk={ask} busy={busy} />
        </div>
      </div>
    </main>
  );
}
