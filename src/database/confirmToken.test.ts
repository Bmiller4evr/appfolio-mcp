// ABOUTME: Tests the stateless, signed confirm token (no server-side session by design, since
// ABOUTME: Vercel serverless functions share no memory across invocations).
import { describe, it, expect, vi } from "vitest";
import { createConfirmToken, verifyConfirmToken } from "./confirmToken";

const SECRET = "a".repeat(32);
const WRITE = { method: "PATCH", url: "https://api.appfolio.com/api/v0/work_orders/123", body: { Status: "Completed" } };

describe("confirm token", () => {
  it("round-trips a valid token back to the original write", () => {
    const token = createConfirmToken(WRITE, SECRET);
    expect(verifyConfirmToken(token, SECRET)).toEqual(WRITE);
  });

  it("rejects a token verified with the wrong secret", () => {
    const token = createConfirmToken(WRITE, SECRET);
    expect(verifyConfirmToken(token, "b".repeat(32))).toBeUndefined();
  });

  it("rejects a malformed token", () => {
    expect(verifyConfirmToken("not-a-real-token", SECRET)).toBeUndefined();
  });

  it("rejects a tampered payload even with a structurally valid token", () => {
    const token = createConfirmToken(WRITE, SECRET);
    const [payload] = token.split(".");
    const tampered = payload + "x." + token.split(".")[1];
    expect(verifyConfirmToken(tampered, SECRET)).toBeUndefined();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createConfirmToken(WRITE, SECRET);
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z")); // 16 minutes later, past the 15-minute TTL
    expect(verifyConfirmToken(token, SECRET)).toBeUndefined();
    vi.useRealTimers();
  });
});
