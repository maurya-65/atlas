import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Atlas runs on localhost, so any website the user visits could try to POST to it (e.g. plant a fake
// "Buy" card through /api/import). Only accept writes from the Atlas page itself or the Atlas Chrome
// extension, and only as JSON (a cross-site form or text/plain POST can't set that without a preflight).
export function proxy(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return NextResponse.next();

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
  matcher: "/api/:path*",
};
