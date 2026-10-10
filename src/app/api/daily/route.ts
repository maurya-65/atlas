import { z } from "zod";
import { updateStore } from "@/lib/store";
import { dailyState, localDay } from "@/lib/daily";
import { errorResponse } from "@/lib/http";

const Body = z.object({
  enabled: z.boolean().optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must look like 09:00").optional(),
  depth: z.number().int().min(0).max(3).optional(),
});

/** Change the daily-run schedule: on/off, time of day, how many stocks to research. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "That setting isn't valid." }, { status: 400 });
    const b = parsed.data;
    await updateStore((s) => {
      const wasOn = s.daily.enabled;
      if (b.time !== undefined) s.daily.time = b.time;
      if (b.depth !== undefined) s.daily.depth = b.depth;
      if (b.enabled !== undefined) s.daily.enabled = b.enabled;
      // Turning it on after today's time has passed: the first run is tomorrow, not right now.
      if (!wasOn && s.daily.enabled) {
        const now = new Date();
        const [h, m] = s.daily.time.split(":").map(Number);
        const at = new Date(now);
        at.setHours(h, m, 0, 0);
        if (now >= at) s.daily.lastRunDay = localDay(now);
      }
    });
    return Response.json({ daily: await dailyState() });
  } catch (e) {
    return errorResponse(e);
  }
}
