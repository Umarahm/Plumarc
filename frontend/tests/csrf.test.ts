import { beforeEach, describe, expect, it, vi } from "vitest";
import { csrfToken, isValidCsrfToken } from "@/lib/csrf";

describe("CSRF token", () => {
  beforeEach(() => vi.stubEnv("AUTH0_SECRET", "a".repeat(64)));

  it("accepts the token of the same session", () => {
    expect(isValidCsrfToken(csrfToken("session-1"), "session-1")).toBe(true);
  });

  it("rejects another session's token, junk and missing values", () => {
    const other = csrfToken("session-2");
    for (const token of [other, "x", "", null, undefined, 7]) {
      expect(isValidCsrfToken(token, "session-1")).toBe(false);
    }
  });

  it("changes when the secret changes", () => {
    const token = csrfToken("session-1");
    vi.stubEnv("AUTH0_SECRET", "b".repeat(64));
    expect(isValidCsrfToken(token, "session-1")).toBe(false);
  });

  it("refuses to run without a secret", () => {
    vi.stubEnv("AUTH0_SECRET", "");
    expect(() => csrfToken("session-1")).toThrow("AUTH0_SECRET");
  });
});
