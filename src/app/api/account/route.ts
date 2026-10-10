import { updateStore } from "@/lib/store";

export async function POST(req: Request) {
  const { accountId } = await req.json();
  if (typeof accountId !== "string") return Response.json({ error: "accountId required" }, { status: 400 });
  await updateStore((s) => {
    s.selectedAccountId = accountId;
    // The paper book mirrors the selected account, so start it fresh.
    s.paper = null;
  });
  return Response.json({ ok: true });
}
