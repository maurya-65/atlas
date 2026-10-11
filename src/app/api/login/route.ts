import { SESSION_COOKIE, SESSION_DAYS, atlasPassword, atlasUsername, sameText, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const expected = atlasPassword();
  if (!expected) return Response.json({ error: "This copy of Atlas doesn't use a password." }, { status: 400 });
  const username = atlasUsername();
  const body = await req.json().catch(() => ({}));
  const userOk = !username || (typeof body.username === "string" && sameText(body.username.trim(), username));
  const passwordOk = typeof body.password === "string" && sameText(body.password, expected);
  if (!userOk || !passwordOk) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 700));
    return Response.json({ error: username ? "That username or password isn't right." : "That password isn't right." }, { status: 401 });
  }
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${SESSION_COOKIE}=${sessionToken(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` } },
  );
}
