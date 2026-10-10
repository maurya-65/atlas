import { updateStore } from "@/lib/store";

export async function POST(req: Request) {
  const { interests } = await req.json();
  if (!Array.isArray(interests)) return Response.json({ error: "interests must be a list" }, { status: 400 });
  const clean = [...new Set(interests.map((i) => String(i).trim()).filter(Boolean))].slice(0, 20);
  await updateStore((s) => {
    s.interests = clean;
  });
  return Response.json({ ok: true });
}
