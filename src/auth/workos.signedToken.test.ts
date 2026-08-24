// ABOUTME: Verifies bearer tokens through the real jose library using a locally signed token
// ABOUTME: shaped like a real OAuth 2.1 access token, carrying client_id and the resource as aud.
import { describe, it, expect, vi } from "vitest";

// Only the network-fetching JWKS lookup is replaced, so jwtVerify below is the real jose
// implementation doing real signature and claim checks against this local key.
const signing = vi.hoisted(() => ({
  key: new TextEncoder().encode("workos-test-signing-secret-32-byte"),
  otherKey: new TextEncoder().encode("a-completely-different-secret-32b!"),
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: vi.fn(() => signing.key) };
});

import { SignJWT } from "jose";
import { verifyToken } from "./workos";

const CONFIG = {
  clientId: "client_123",
  apiKey: "sk_test",
  authkitDomain: "https://auth.example.com",
  organizationId: "org_123",
};

// The resource identifier the requests below resolve to, which is the value an RFC 8707
// authorization server stamps into aud when the token was requested for this server.
const RESOURCE = "https://mcp.example.com";

function mcpRequest(): Request {
  return new Request(`${RESOURCE}/api/mcp`);
}

// Mirrors the claim set an OAuth 2.1 access token from this authorization server carries: an
// iss, a client_id, and an aud naming the resource the token was requested for.
async function signAccessToken(
  claims: Record<string, unknown> = {},
  key: Uint8Array = signing.key
): Promise<string> {
  return new SignJWT({
    iss: CONFIG.authkitDomain,
    aud: RESOURCE,
    client_id: CONFIG.clientId,
    org_id: CONFIG.organizationId,
    role: "admin",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user_123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

describe("verifyToken against a real OAuth-shaped token", () => {
  it("accepts a correctly signed token whose aud names this server's resource", async () => {
    const token = await signAccessToken();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toEqual({
      token,
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("accepts a token whose aud is an array containing this server's resource", async () => {
    const token = await signAccessToken({ aud: ["https://other.example.com", RESOURCE] });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  it("rejects a token minted for a different resource server", async () => {
    const token = await signAccessToken({ aud: "https://someone-elses-mcp.example.com" });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects a token carrying no aud claim at all", async () => {
    const token = await signAccessToken({ aud: undefined });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("accepts a token whose aud matches the forwarded host this server is reached at", async () => {
    const token = await signAccessToken({ aud: "https://public.example.com" });

    const result = await verifyToken(
      new Request("http://localhost:3000/api/mcp", {
        headers: { "x-forwarded-host": "public.example.com", "x-forwarded-proto": "https" },
      }),
      token,
      CONFIG
    );

    expect(result?.extra.userId).toBe("user_123");
  });

  it("accepts a token whose issuer carries a trailing slash the config does not", async () => {
    const token = await signAccessToken({ iss: `${CONFIG.authkitDomain}/` });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  it("rejects a token from a different issuer domain", async () => {
    const token = await signAccessToken({ iss: "https://auth.example.net" });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects a token minted for a different client", async () => {
    const token = await signAccessToken({ client_id: "client_someone_else" });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects a token signed with a key the JWKS does not vouch for", async () => {
    const token = await signAccessToken({}, signing.otherKey);

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({
      iss: CONFIG.authkitDomain,
      aud: RESOURCE,
      client_id: CONFIG.clientId,
      org_id: CONFIG.organizationId,
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signing.key);

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });
});
