import { createHmac, timingSafeEqual } from "node:crypto";

// Signed synchronizer token: derived from the session id, so there is nothing to
// store and a token stops working when the session changes.
export function csrfToken(sessionId: string): string {
  const secret = process.env.AUTH0_SECRET;
  if (!secret) throw new Error("AUTH0_SECRET is not set");
  return createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url");
}

export function isValidCsrfToken(token: unknown, sessionId: string): boolean {
  if (typeof token !== "string") return false;
  const given = Buffer.from(token);
  const expected = Buffer.from(csrfToken(sessionId));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
