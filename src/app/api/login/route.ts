import { SESSION_COOKIE, SESSION_DAYS, atlasPassword, sameText, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const expected = atlasPassword();
  if (!expected) return Response.json({ error: "This copy of Atlas doesn't use a password." }, { status: 400 });
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !sameText(password, expected)) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 700));
    return Response.json({ error: "That password isn't right." }, { status: 401 });
  }
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${SESSION_COOKIE}=${sessionToken(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` } },
  );
}
