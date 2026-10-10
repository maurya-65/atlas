import { ask } from "@/lib/chat";
import { errorResponse } from "@/lib/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    const text = typeof question === "string" ? question.trim() : "";
    if (!text) return Response.json({ error: "Type a question first." }, { status: 400 });
    if (text.length > 500) return Response.json({ error: "Keep the question under 500 characters." }, { status: 400 });
    return Response.json({ messages: await ask(text) });
  } catch (e) {
    return errorResponse(e);
  }
}
