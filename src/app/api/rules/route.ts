import { updateStore } from "@/lib/store";

export async function POST(req: Request) {
  const { action, id } = await req.json();
  if (action !== "delete" || typeof id !== "string") return Response.json({ error: "Unsupported rule action." }, { status: 400 });
  await updateStore((s) => {
    s.rules = s.rules.filter((r) => r.id !== id);
  });
  return Response.json({ ok: true });
}
