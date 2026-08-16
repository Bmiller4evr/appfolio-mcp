// ABOUTME: Integration-style test: calls the exported route handler directly with a crafted
// ABOUTME: Request, covering the 401 path and the role resolved from a token reaching the tools.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/database/operations.generated", () => ({
  DATABASE_OPERATIONS: [
    { method: "GET", path: "/tenants", operationId: "getTenants", summary: "List tenants", tag: "Tenants" },
    {
      method: "DELETE",
      path: "/inspections/{id}",
      operationId: "deleteInspection",
      summary: "Delete inspection",
      tag: "Inspections",
    },
  ],
}));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: vi.fn().mockRejectedValue(new Error("no token")) }));

// loadConfig() runs at module scope in route.ts, so the required env vars must exist before
// that import evaluates. vi.hoisted runs before imports (same hoisting vitest gives vi.mock),
// unlike a plain top-of-file statement or beforeAll, which would run too late.
vi.hoisted(() => {
  process.env.WORKOS_CLIENT_ID = "client_123";
  process.env.WORKOS_API_KEY = "sk_test_123";
  process.env.WORKOS_AUTHKIT_DOMAIN = "https://auth.example.com";
  process.env.WORKOS_ORGANIZATION_ID = "org_123";
  process.env.APPFOLIO_MCP_TOKEN_SECRET = "a".repeat(32);
  // The database tools only register when the Database API module is configured.
  process.env.APPFOLIO_DEVELOPER_ID = "dev_1";
  process.env.APPFOLIO_DB_CLIENT_ID = "db_client";
  process.env.APPFOLIO_DB_CLIENT_SECRET = "db_secret";
});

import { jwtVerify } from "jose";
import { POST } from "./route";

function mcpRequest(body: unknown, bearerToken?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  return new Request("https://mcp.example.com/api/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

function authenticateAs(role: string): void {
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: { sub: "user_123", org_id: "org_123", role },
  } as never);
}

async function listEndpointsAs(role: string): Promise<string> {
  authenticateAs(role);
  const res = await POST(
    mcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_endpoints", arguments: {} } },
      "valid.jwt.token"
    )
  );
  expect(res.status).toBe(200);
  return res.text();
}

describe("MCP route", () => {
  beforeEach(() => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("no token"));
  });

  it("rejects a request with no bearer token", async () => {
    const res = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    );
    expect(res.status).toBe(401);
  });

  it("gives an admin caller the destructive operation", async () => {
    const body = await listEndpointsAs("admin");
    expect(body).toContain("deleteInspection");
  });

  it("hides the destructive operation from an owner caller", async () => {
    const body = await listEndpointsAs("member");
    expect(body).toContain("getTenants");
    expect(body).not.toContain("deleteInspection");
  });
});
