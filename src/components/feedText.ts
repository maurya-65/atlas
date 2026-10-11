import type { ChatMessage } from "@/lib/types";
import { plainText } from "./format";

export const dayKey = (iso: string) => new Date(iso).toDateString();

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** The first sentence of a text, cut to `max` characters. */
export function oneLine(text: string, max = 90): string {
  const t = plainText(text);
  const sentence = /^(.{20,}?[.!?])\s/.exec(t)?.[1] ?? t;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** A card's own title, or its first sentence when it has none. */
export const titleOf = (m: ChatMessage) => m.title || oneLine(m.text);

/** Link style inside the text of a card or row. */
export const LINK = "font-medium text-foreground underline decoration-white/25 underline-offset-4 hover:decoration-white";
