import { updateStore } from "@/lib/store";

export async function POST(req: Request) {
  const { action } = await req.json();
  if (action !== "clear") return Response.json({ error: "Unsupported memory action." }, { status: 400 });
  await updateStore((s) => {
    s.memory = [];
  });
  return Response.json({ ok: true });
}
