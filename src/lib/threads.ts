import { addMessages, newMessage, updateStore } from "./store";
import type { ChatMessage, ChatThread } from "./types";

// A chat is the messages that share a threadId. The browser makes the id when the first message is sent,
// so there is no thread record to create or keep in step with the messages.

const ID = /^[A-Za-z0-9-]{8,64}$/;
const TITLE_LENGTH = 48;

/** A chat id from a request body: undefined when absent, null when present but not valid. */
export function chatId(value: unknown): string | undefined | null {
  if (value == null) return undefined;
  return typeof value === "string" && ID.test(value) ? value : null;
}

export function threadsOf(messages: ChatMessage[]): ChatThread[] {
  const byId = new Map<string, ChatThread>();
  for (const m of messages) {
    if (!m.threadId) continue;
    const thread = byId.get(m.threadId) ?? { id: m.threadId, title: "", updatedAt: m.createdAt };
    if (!thread.title && m.kind === "user") thread.title = m.text.length > TITLE_LENGTH ? `${m.text.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : m.text;
    thread.updatedAt = m.createdAt;
    byId.set(m.threadId, thread);
  }
  return [...byId.values()].map((t) => ({ ...t, title: t.title || "New chat" })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function say(threadId: string, text: string): Promise<ChatMessage> {
  const [message] = await addMessages(newMessage({ kind: "user", text, threadId }));
  return message;
}

export async function deleteThread(threadId: string): Promise<void> {
  await updateStore((s) => {
    s.messages = s.messages.filter((m) => m.threadId !== threadId);
  });
}
