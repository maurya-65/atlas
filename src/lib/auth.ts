import { createHmac, timingSafeEqual } from "crypto";

// Optional sign-in. Atlas shows a brokerage account and spends API credit, so a copy that is reachable
// from the internet must sit behind a password: set ATLAS_PASSWORD. On your own computer it can stay unset.

export const SESSION_COOKIE = "atlas_session";
export const SESSION_DAYS = 30;

export function atlasPassword(): string {
  return process.env.ATLAS_PASSWORD ?? "";
}

/** What the session cookie must hold. Derived from the password, so changing the password signs everyone out. */
export function sessionToken(password = atlasPassword()): string {
  return createHmac("sha256", password).update("atlas-session-v1").digest("hex");
}

/** Compare two secrets without leaking, through timing, how much of a guess was right. */
export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
