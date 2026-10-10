// Starts the daily-run scheduler once, in the Node server only (not the edge runtime, not the MCP process).
// On Vercel there is no long-running server to keep a timer in: its cron calls /api/cron/daily instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
