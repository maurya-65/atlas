import { addMessages, newMessage, updateStore } from "@/lib/store";
import { executeApprovedTrade } from "@/lib/trading";
import { errorResponse, errorText } from "@/lib/http";
import { isResearchableStock, type CardOption, type ChatMessage } from "@/lib/types";

export const maxDuration = 300;

/** The user clicked an option on a decision card. This is the only path that executes trades. */
export async function POST(req: Request) {
  try {
    const { messageId, optionIndex } = await req.json();
    // Look the card up and mark it decided in one step: a second click that arrives while the first is
    // still working finds it already decided, so the same trade can never run twice.
    const claim = await updateStore((st): { option: CardOption } | { error: string; status: number } => {
      const m = st.messages.find((x) => x.id === messageId);
      const o = Number.isInteger(optionIndex) ? m?.options?.[optionIndex] : undefined;
      if (!m || !o) return { error: "That card no longer exists.", status: 404 };
      if (m.resolved) return { error: "You already decided on this one.", status: 409 };
      const ticker = o.payload?.ticker;
      if (o.kind === "research" && ticker && !isResearchableStock(ticker)) {
        return { error: `Atlas researches companies. ${ticker} is a fund or a crypto asset, so there are no company filings to read.`, status: 400 };
      }
      // A link to Claude is handled in the browser and decides nothing.
      if (o.kind !== "open_claude") m.resolved = o.label;
      return { option: o };
    });
    if ("error" in claim) return Response.json({ error: claim.error }, { status: claim.status });
    const { option } = claim;
    const reopen = () =>
      updateStore((st) => {
        const m = st.messages.find((x) => x.id === messageId);
        if (m) delete m.resolved;
      });

    let out: ChatMessage[] = [];
    const p = option.payload ?? {};
    switch (option.kind) {
      case "approve_trade": {
        try {
          if (!p.ticker || !p.side || !p.dollars) throw new Error("This trade card is missing details.");
          const t = await executeApprovedTrade(p.ticker, p.side, p.dollars, { forcePaper: p.paper === true });
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
          await reopen();
          out = await addMessages(newMessage({ kind: "agent", text: `I didn't place that trade. ${errorText(e)}` }));
        }
        break;
      }
      case "research": {
        if (!p.ticker) {
          await reopen();
          throw new Error("No ticker on this card.");
        }
        // The app runs the research itself so it can stream the agents live.
        return Response.json({ messages: [], next: { research: p.ticker } });
      }
      case "add_interest": {
        const topic = p.topic;
        if (!topic) {
          await reopen();
          throw new Error("No topic on this card.");
        }
        await updateStore((st) => {
          if (!st.interests.some((i) => i.toLowerCase() === topic.toLowerCase())) st.interests.push(topic);
        });
        out = await addMessages(newMessage({ kind: "thought", text: `Added "${topic}" to what I keep an eye on.` }));
        break;
      }
      case "dismiss":
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
