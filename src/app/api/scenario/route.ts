import { addMessages, newMessage, readStore } from "@/lib/store";
import { activePortfolio } from "@/lib/portfolio";
import { runScenario } from "@/lib/scenario";
import { errorResponse } from "@/lib/http";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { scenario } = await req.json();
    const text = typeof scenario === "string" ? scenario.trim() : "";
    if (!text) return Response.json({ error: "Describe a what-if first, e.g. \"What if Tesla cuts prices again?\"" }, { status: 400 });
    if (text.length > 500) return Response.json({ error: "Keep the what-if under 500 characters." }, { status: 400 });
    const [portfolio, s] = await Promise.all([activePortfolio(), readStore()]);
    const result = await runScenario(text, { portfolio, interests: s.interests });
    const [message] = await addMessages(
      newMessage({ kind: "scenario", text: "", scenario: result, options: result.options, sources: result.sources }),
    );
    return Response.json({ message });
  } catch (e) {
    return errorResponse(e);
  }
}
