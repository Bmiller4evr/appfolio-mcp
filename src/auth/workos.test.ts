// ABOUTME: Tests WorkOS bearer-token verification and org-role to owner/admin mapping.
// ABOUTME: jwtVerify itself is mocked, this tests our wiring, not the jose library.
import { describe, it, expect, vi } from "vitest";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "JWKS_PLACEHOLDER"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
import { verifyToken, resolveRole } from "./workos";

const CONFIG = { clientId: "client_123", apiKey: "sk_test", authkitDomain: "https://auth.example.com" };

describe("resolveRole", () => {
  it("maps the WorkOS admin org role to admin", () => {
    expect(resolveRole("admin")).toBe("admin");
  });

  it("maps any other org role to owner", () => {
    expect(resolveRole("member")).toBe("owner");
  });
});

describe("verifyToken", () => {
  it("returns undefined when no bearer token is present", async () => {
    const result = await verifyToken(new Request("https://mcp.example.com"), undefined, CONFIG);
    expect(result).toBeUndefined();
  });

  it("returns AuthInfo with the resolved role in extra, for a valid token", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "user_123", org_role: "admin" },
    } as any);

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("returns undefined when jwtVerify rejects an invalid token", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature invalid"));
    const result = await verifyToken(new Request("https://mcp.example.com"), "garbage", CONFIG);
    expect(result).toBeUndefined();
  });

  it("defaults to owner when the token has no org_role claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "user_123" },
    } as any);

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "owner" },
    });
  });
});
