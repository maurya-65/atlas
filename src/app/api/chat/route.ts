import { answer } from "@/lib/chat";
import { errorResponse } from "@/lib/http";
import { chatId } from "@/lib/threads";

export const maxDuration = 60;

/** Answer the last thing the user said in a chat. */
export async function POST(req: Request) {
  try {
    const threadId = chatId((await req.json()).threadId);
    if (!threadId) return Response.json({ error: "Which chat is this for?" }, { status: 400 });
    return Response.json({ message: await answer(threadId) });
  } catch (e) {
    return errorResponse(e);
  }
}
