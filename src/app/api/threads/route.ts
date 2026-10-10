import { chatId, deleteThread, say } from "@/lib/threads";

const MAX_TEXT = 500;

/** Save what the user said in a chat, or delete a chat. */
export async function POST(req: Request) {
  const { action, threadId: raw, text } = await req.json();
  const threadId = chatId(raw);
  if (!threadId) return Response.json({ error: "Which chat is this for?" }, { status: 400 });

  if (action === "say") {
    const said = typeof text === "string" ? text.trim() : "";
    if (!said) return Response.json({ error: "Type something first." }, { status: 400 });
    if (said.length > MAX_TEXT) return Response.json({ error: `Keep it under ${MAX_TEXT} characters.` }, { status: 400 });
    return Response.json({ message: await say(threadId, said) });
  }
  if (action === "delete") {
    await deleteThread(threadId);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unsupported chat action." }, { status: 400 });
}
