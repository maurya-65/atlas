import { readStore, updateStore } from "./store";
import { isDue, localDay, runDaily } from "./daily";

// Checks once a minute whether the daily run is due. Because "due" means "at or past the set time and
// not yet run today", a server started after the set time catches up on its own.

const g = globalThis as { __atlasScheduler?: NodeJS.Timeout };

async function tick() {
  try {
    const s = await readStore();
    if (!isDue(s.daily, new Date())) return;
    // One attempt a day: a run that fails halfway must not retry every minute and spend API credit again.
    await updateStore((st) => {
      st.daily.lastRunDay = localDay(new Date());
    });
    console.log("Atlas daily run: starting");
    await runDaily({ trigger: "schedule" });
    console.log("Atlas daily run: done");
  } catch (e) {
    console.error("Atlas daily run failed:", e);
  }
}

export function startScheduler() {
  if (g.__atlasScheduler) return;
  g.__atlasScheduler = setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
}
