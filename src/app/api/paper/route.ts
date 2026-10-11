import { errorResponse } from "@/lib/http";
import { paperAccount, paperPerformance, resetPaperAccount } from "@/lib/paper";
import { activePortfolio } from "@/lib/portfolio";
import { readStore } from "@/lib/store";
import type { Portfolio } from "@/lib/types";

/** The paper account, its trades and what they did, for the Portfolio page. */
export async function GET() {
  try {
    // Reading the active portfolio also seeds the paper book the first time it is needed.
    const portfolio: Portfolio | null = await activePortfolio().catch(() => null);
    const s = await readStore();
    const prices = Object.fromEntries((portfolio?.holdings ?? []).map((h) => [h.ticker, h.price]));
    return Response.json({
      book: s.paper ? paperAccount(s.paper, prices) : null,
      trades: [...s.trades].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      performance: paperPerformance(s.trades, prices),
      brokerOrders: portfolio?.recentOrders ?? [],
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Starts the paper account over from the connected account. */
export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    if (action !== "reset") return Response.json({ error: "Unsupported paper action." }, { status: 400 });
    await resetPaperAccount();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
