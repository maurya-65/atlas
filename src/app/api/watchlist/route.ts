import { updateStore } from "@/lib/store";
import { isResearchableStock } from "@/lib/types";

const MAX_WATCHLIST = 30;

/** Adds or removes a company on the watchlist: stocks the user follows without owning. */
export async function POST(req: Request) {
  const { action, ticker } = await req.json();
  const t = String(ticker ?? "").toUpperCase().trim();
  if (!/^[A-Z.\-]{1,10}$/.test(t)) return Response.json({ error: "That doesn't look like a ticker symbol." }, { status: 400 });

  if (action === "add") {
    if (!isResearchableStock(t)) return Response.json({ error: `${t} is a fund or a crypto asset. The watchlist is for companies.` }, { status: 400 });
    const full = await updateStore((s) => {
      if (s.watchlist.includes(t)) return false;
      if (s.watchlist.length >= MAX_WATCHLIST) return true;
      s.watchlist.push(t);
      return false;
    });
    if (full) return Response.json({ error: `You can follow up to ${MAX_WATCHLIST} companies. Remove one first.` }, { status: 400 });
    return Response.json({ ok: true });
  }
  if (action === "remove") {
    await updateStore((s) => {
      s.watchlist = s.watchlist.filter((x) => x !== t);
    });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unsupported watchlist action." }, { status: 400 });
}
