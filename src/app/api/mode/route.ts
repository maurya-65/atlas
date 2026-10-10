import { readStore, updateStore, addMessages, newMessage } from "@/lib/store";
import { realPortfolio, snaptradeErrorText } from "@/lib/snaptrade";
import { LIVE_LIMITS } from "@/lib/trading";

export async function POST(req: Request) {
  const { mode, confirm } = await req.json();
  if (mode !== "paper" && mode !== "live") return Response.json({ error: "Unknown mode." }, { status: 400 });
  const s = await readStore();
  if (s.mode === mode) return Response.json({ ok: true });

  if (mode === "live") {
    // Real orders from a copy that anyone with one password can reach are not worth the risk.
    if (process.env.VERCEL) return Response.json({ error: "Live mode only works when Atlas runs on your own computer." }, { status: 400 });
    if (confirm !== "LIVE") return Response.json({ error: "Type LIVE to confirm you want to use real money." }, { status: 400 });
    try {
      const real = await realPortfolio();
      if (!real) return Response.json({ error: "Connect a brokerage account first. Live mode needs a real account." }, { status: 400 });
    } catch (e) {
      return Response.json({ error: snaptradeErrorText(e) }, { status: 400 });
    }
  }
  await updateStore((st) => {
    st.mode = mode;
  });
  await addMessages(
    newMessage({
      kind: "agent",
      text:
        mode === "live"
          ? `You switched to **live mode**. Trades you approve now use real money in your brokerage account, capped at $${LIVE_LIMITS.perTrade} per trade and $${LIVE_LIMITS.perDay} per day. I still never trade without your click.`
          : "You're back in **paper mode**. Trades are simulated again; no real money moves.",
    }),
  );
  return Response.json({ ok: true });
}
