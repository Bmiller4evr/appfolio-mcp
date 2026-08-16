// ABOUTME: Integration-style test: calls the exported route handler directly with a crafted
// ABOUTME: Request, verifying an unauthenticated tools/list call is rejected before any tool runs.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/database/operations.generated", () => ({ DATABASE_OPERATIONS: [] }));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: vi.fn().mockRejectedValue(new Error("no token")) }));

// loadConfig() runs at module scope in route.ts, so the required env vars must exist before
// that import evaluates. vi.hoisted runs before imports (same hoisting vitest gives vi.mock),
// unlike a plain top-of-file statement or beforeAll, which would run too late.
vi.hoisted(() => {
  process.env.WORKOS_CLIENT_ID = "client_123";
  process.env.WORKOS_API_KEY = "sk_test_123";
  process.env.WORKOS_AUTHKIT_DOMAIN = "https://auth.example.com";
  process.env.APPFOLIO_MCP_TOKEN_SECRET = "a".repeat(32);
});

import { POST } from "./route";

describe("MCP route", () => {
  it("rejects a request with no bearer token", async () => {
    const req = new Request("https://mcp.example.com/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
