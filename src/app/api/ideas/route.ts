import { z } from "zod";
import { acceptIdea, findIdeas, previewIdea, startIdeas, trackedIdeas } from "@/lib/ideas";
import { errorResponse, ndjsonStream } from "@/lib/http";

// Finding ideas makes a few small model calls and checks market data for each candidate; progress streams to the page.
export const maxDuration = 120;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), prompt: z.string().trim().min(3, "Say what you are looking for first.").max(500, "Keep it under 500 characters.") }),
  z.object({ action: z.literal("answer"), id: z.string().max(64), answers: z.array(z.string()).max(4) }),
  z.object({ action: z.literal("preview"), id: z.string().max(64), ticker: z.string().max(10).transform((t) => t.toUpperCase()), dollars: z.number() }),
  z.object({ action: z.literal("accept"), id: z.string().max(64), ticker: z.string().max(10).transform((t) => t.toUpperCase()), dollars: z.number() }),
]);

/** The ideas Atlas suggested and tried on paper, with what each has gained or lost since. */
export async function GET() {
  try {
    return Response.json(await trackedIdeas());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Ideas are only ever tried on the paper account: nothing here can place a live order. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "That request isn't valid." }, { status: 400 });
  const body = parsed.data;
  try {
    switch (body.action) {
      case "start":
        return ndjsonStream((send) => startIdeas(body.prompt, send));
      case "answer":
        return ndjsonStream((send) => findIdeas(body.id, body.answers, send));
      case "preview":
        return Response.json({ preview: await previewIdea(body.id, body.ticker, body.dollars) });
      case "accept":
        return Response.json({ trade: await acceptIdea(body.id, body.ticker, body.dollars) });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
