import { finishReview, startReview } from "@/lib/review";
import { errorResponse } from "@/lib/http";

const TICKER = /^[A-Z.\-]{1,10}$/;

/**
 * Portfolio review, start and finish. The research in between is one /api/research request per stock,
 * so no single request has to stay open for the whole review.
 */
export async function POST(req: Request) {
  try {
    const { step, tickers } = await req.json().catch(() => ({}));
    if (step === "start") return Response.json({ picks: (await startReview()).picks });
    if (step === "finish") {
      const list = Array.isArray(tickers) ? tickers.filter((t): t is string => typeof t === "string" && TICKER.test(t)).slice(0, 5) : [];
      if (!list.length) return Response.json({ error: "Nothing was reviewed." }, { status: 400 });
      return Response.json({ messages: await finishReview(list) });
    }
    return Response.json({ error: "Unknown review step." }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
