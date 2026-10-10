import { researchAndPost, researchForReview } from "@/lib/review";
import { activePortfolio } from "@/lib/portfolio";
import { ndjsonStream } from "@/lib/http";
import { isResearchableStock } from "@/lib/types";

// Deep research runs several Opus agents and a debate round; progress streams to the app as it happens.
// 300 seconds is the most every Vercel plan allows; one stock takes about a minute and a half.
export const maxDuration = 300;

export async function POST(req: Request) {
  const { ticker, review } = await req.json().catch(() => ({}));
  const t = String(ticker ?? "").toUpperCase().trim();
  if (!/^[A-Z.\-]{1,10}$/.test(t)) return Response.json({ error: "That doesn't look like a ticker symbol." }, { status: 400 });
  // For a holding, the broker's own label says whether it is a company stock.
  const held = (await activePortfolio().catch(() => null))?.holdings.find((h) => h.ticker === t);
  if (!isResearchableStock(t, held?.kind)) {
    return Response.json({ error: `Atlas researches companies. ${t} is a fund or a crypto asset, so there are no company filings to read.` }, { status: 400 });
  }
  const place = Number.isInteger(review?.index) && Number.isInteger(review?.count) && review.index >= 0 && review.index < review.count ? review : null;
  return ndjsonStream((send) =>
    place ? researchForReview(t, { index: place.index, count: place.count }, { onEvent: send }) : researchAndPost(t, { onEvent: send }),
  );
}
