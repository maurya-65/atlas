import { researchAndPost } from "@/lib/review";
import { ndjsonStream } from "@/lib/http";

// Deep research runs several Opus agents and a debate round; progress streams to the app as it happens.
export const maxDuration = 800;

export async function POST(req: Request) {
  const { ticker } = await req.json().catch(() => ({}));
  const t = String(ticker ?? "").toUpperCase().trim();
  if (!/^[A-Z.\-]{1,10}$/.test(t)) return Response.json({ error: "That doesn't look like a ticker symbol." }, { status: 400 });
  return ndjsonStream((send) => researchAndPost(t, { onEvent: send }));
}
