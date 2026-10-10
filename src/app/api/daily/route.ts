import { z } from "zod";
import { dailyState, isTimeZone, setSchedule } from "@/lib/daily";
import { errorResponse } from "@/lib/http";

const Body = z.object({
  enabled: z.boolean().optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must look like 09:00").optional(),
  depth: z.number().int().min(0).max(3).optional(),
  // The browser's time zone, so the time of day means the user's clock wherever Atlas runs.
  timeZone: z.string().max(64).refine(isTimeZone, "Unknown time zone").optional(),
});

/** Change the daily-run schedule: on/off, time of day, how many stocks to research. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "That setting isn't valid." }, { status: 400 });
    await setSchedule(parsed.data);
    return Response.json({ daily: await dailyState() });
  } catch (e) {
    return errorResponse(e);
  }
}
