import { reviewPortfolio } from "@/lib/review";
import { ndjsonStream } from "@/lib/http";

// Deep research on each of the biggest holdings, one after another; progress streams to the app.
export const maxDuration = 800;

export async function POST() {
  return ndjsonStream((send) => reviewPortfolio({ onEvent: send }));
}
