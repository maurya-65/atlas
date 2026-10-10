import { connectionPortalUrl, snaptradeErrorText } from "@/lib/snaptrade";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    return Response.redirect(await connectionPortalUrl(`${origin}/?connected=1`), 302);
  } catch (e) {
    return Response.redirect(`${origin}/?connectError=${encodeURIComponent(snaptradeErrorText(e))}`, 302);
  }
}
