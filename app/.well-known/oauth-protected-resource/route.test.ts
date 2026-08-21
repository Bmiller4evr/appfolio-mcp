// ABOUTME: Tests the discovery document MCP clients fetch after a 401 challenge: it must
// ABOUTME: exist, be JSON, and name our AuthKit domain as the authorization server.
import { describe, it, expect, vi } from "vitest";

// loadConfig() runs at module scope in route.ts, so the required env vars must exist before
// that import evaluates. vi.hoisted runs before imports, unlike a plain top-of-file statement.
vi.hoisted(() => {
  process.env.WORKOS_CLIENT_ID = "client_123";
  process.env.WORKOS_API_KEY = "sk_test_123";
  process.env.WORKOS_AUTHKIT_DOMAIN = "https://auth.example.com";
  process.env.WORKOS_ORGANIZATION_ID = "org_123";
  process.env.APPFOLIO_MCP_TOKEN_SECRET = "a".repeat(32);
});

import { GET, OPTIONS } from "./route";

describe("oauth-protected-resource metadata", () => {
  it("returns the resource and its authorization server", async () => {
    const req = new Request("https://mcp.example.com/.well-known/oauth-protected-resource");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"],
    });
  });

  it("answers the browser CORS preflight", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
