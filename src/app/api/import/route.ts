import { importClaudeReport } from "@/lib/review";
import { ImportError } from "@/lib/handoff";
import { errorResponse } from "@/lib/http";

/** The user pasted a Claude Deep Research answer back into Atlas. Plain parsing, no API call. */
export async function POST(req: Request) {
  try {
    const { text, ticker } = await req.json();
    // The extension sends the ticker of the job it ran, so a mismatched answer can't become a card.
    const expected = typeof ticker === "string" && /^[A-Z.\-]{1,10}$/.test(ticker) ? ticker : undefined;
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "Paste Claude's answer first." }, { status: 400 });
    if (text.length > 200_000) return Response.json({ error: "That's too long. Paste just Claude's answer." }, { status: 400 });
    try {
      return Response.json({ message: await importClaudeReport(text, expected) });
    } catch (e) {
      if (e instanceof ImportError) return Response.json({ error: e.message }, { status: 400 });
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
