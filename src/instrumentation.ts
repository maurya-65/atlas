// Starts the daily-run scheduler once, in the Node server only (not the edge runtime, not the MCP process).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
