import type { Job } from "./jobs";

/** The running Atlas research or Claude research on a company, if any. */
export function runningResearch(running: Job[], ticker: string): Job | undefined {
  return running.find((j) => (j.kind === "research" || j.kind === "claude") && j.label.endsWith(` on ${ticker}`));
}
