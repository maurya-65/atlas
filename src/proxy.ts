import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, atlasPassword, sameText, sessionToken } from "./lib/auth";

// Two checks before a request reaches Atlas.
//
// 1. Sign-in. With ATLAS_PASSWORD set, every page and API call needs the session cookie. On a public host
//    (Vercel) the password is required: without it Atlas refuses to serve anything.
// 2. Writes. Any website the user visits could try to POST to Atlas (e.g. plant a fake "Buy" card through
//    /api/import). Only accept writes from the Atlas page itself or the Atlas Chrome extension, and only as
//    JSON (a cross-site form or text/plain POST can't set that without a preflight).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const password = atlasPassword();

  if (!password && process.env.VERCEL) {
    const message = "Atlas isn't set up yet: add ATLAS_PASSWORD to this deployment's environment variables, then redeploy.";
    return isApi ? NextResponse.json({ error: message }, { status: 503 }) : new NextResponse(message, { status: 503 });
  }

  if (password) {
    // The cron route checks its own secret (CRON_SECRET); a timer has no cookie.
    const open = pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/api/cron/");
    const signedIn = sameText(request.cookies.get(SESSION_COOKIE)?.value ?? "", sessionToken(password));
    if (!open && !signedIn) {
      if (isApi) return NextResponse.json({ error: "Sign in to Atlas first." }, { status: 401 });
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      return NextResponse.redirect(login);
    }
  }

  if (!isApi || request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return NextResponse.next();

  const origin = request.headers.get("origin");
  const sameOrigin = origin === request.nextUrl.origin;
  const fromExtension = origin?.startsWith("chrome-extension://") ?? false;
  // No Origin header: not a browser page (e.g. curl); browsers always send it on cross-site POSTs.
  if (origin && !sameOrigin && !fromExtension) {
    return NextResponse.json({ error: "Requests to Atlas must come from the Atlas page." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|ico)$).*)"],
};
