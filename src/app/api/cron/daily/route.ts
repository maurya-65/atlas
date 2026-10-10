import { updateStore } from "@/lib/store";
import { isDueToday, localDay, runDaily } from "@/lib/daily";
import { sameText } from "@/lib/auth";
import { errorText } from "@/lib/http";

// The daily run for a host with no long-running server. Vercel Cron calls this (see vercel.json) and
// sends "Authorization: Bearer <CRON_SECRET>"; without that secret set, nothing can trigger it.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameText(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  const now = new Date();
  const start = await updateStore((s) => {
    if (!isDueToday(s.daily, now)) return false;
    // One attempt a day: a run that fails halfway must not start again on the next call and spend API credit twice.
    s.daily.lastRunDay = localDay(now, s.daily.timeZone);
    return true;
  });
  if (!start) return Response.json({ ran: false });
  try {
    const posted = await runDaily({ trigger: "schedule" });
    return Response.json({ ran: true, posted: posted.length });
  } catch (e) {
    console.error("Atlas daily run failed:", e);
    return Response.json({ ran: false, error: errorText(e) }, { status: 500 });
  }
}
