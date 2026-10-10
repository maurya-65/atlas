import { runDaily } from "@/lib/daily";
import { ndjsonStream } from "@/lib/http";

// Run the daily check now; research progress streams to the app.
export const maxDuration = 300;

export async function POST() {
  return ndjsonStream((send) => runDaily({ trigger: "manual", onEvent: send }));
}
