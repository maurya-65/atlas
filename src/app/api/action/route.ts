import { addMessages, newMessage, readStore, updateStore } from "@/lib/store";
import { executeApprovedTrade } from "@/lib/trading";
import { errorResponse, errorText } from "@/lib/http";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 300;

/** The user clicked an option on a decision card. This is the only path that executes trades. */
export async function POST(req: Request) {
  try {
    const { messageId, optionIndex } = await req.json();
    const s = await readStore();
    const card = s.messages.find((m) => m.id === messageId);
    const option = card?.options?.[optionIndex];
    if (!card || !option) return Response.json({ error: "That card no longer exists." }, { status: 404 });
    if (card.resolved) return Response.json({ error: "You already decided on this one." }, { status: 409 });

    const resolve = (label: string) =>
      updateStore((st) => {
        const m = st.messages.find((x) => x.id === messageId);
        if (m) m.resolved = label;
      });

    let out: ChatMessage[] = [];
    const p = option.payload ?? {};
    switch (option.kind) {
      case "approve_trade": {
        if (!p.ticker || !p.side || !p.dollars) throw new Error("This trade card is missing details.");
        try {
          const t = await executeApprovedTrade(p.ticker, p.side, p.dollars, { forcePaper: p.paper === true });
          await resolve(option.label);
          const verb = t.side === "BUY" ? "Bought" : "Sold";
          out = await addMessages(
            newMessage({
              kind: "receipt",
              mode: t.mode,
              text:
                t.mode === "paper"
                  ? `${verb} $${t.dollars.toFixed(2)} of ${t.ticker} at about $${t.price.toFixed(2)} per share (${t.units.toFixed(4)} shares). Simulated: no real money moved.`
                  : `Sent a real order to your brokerage: ${t.side} $${t.dollars.toFixed(2)} of ${t.ticker} (market order, good for today only). Broker status: ${t.status}.`,
            }),
          );
        } catch (e) {
          out = await addMessages(newMessage({ kind: "agent", text: `I didn't place that trade. ${errorText(e)}` }));
        }
        break;
      }
      case "research": {
        if (!p.ticker) throw new Error("No ticker on this card.");
        await resolve(option.label);
        // The app runs the research itself so it can stream the agents live.
        return Response.json({ messages: [], next: { research: p.ticker } });
      }
      case "add_interest": {
        const topic = p.topic;
        if (!topic) throw new Error("No topic on this card.");
        await updateStore((st) => {
          if (!st.interests.some((i) => i.toLowerCase() === topic.toLowerCase())) st.interests.push(topic);
        });
        await resolve(option.label);
        out = await addMessages(newMessage({ kind: "thought", text: `Added "${topic}" to what I keep an eye on.` }));
        break;
      }
      case "dismiss":
        await resolve(option.label);
        break;
      case "open_claude":
        // A link handled in the browser; nothing to do here.
        break;
    }
    return Response.json({ messages: out });
  } catch (e) {
    return errorResponse(e);
  }
}
