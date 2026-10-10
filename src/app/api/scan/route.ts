import { watchOnce } from "@/lib/watch";
import { errorResponse } from "@/lib/http";

export const maxDuration = 300;

export async function POST() {
  try {
    return Response.json({ messages: await watchOnce() });
  } catch (e) {
    return errorResponse(e);
  }
}
