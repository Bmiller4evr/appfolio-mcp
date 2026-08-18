// ABOUTME: Verifies bearer tokens through the real jose library using a locally signed token
// ABOUTME: shaped like a genuine AuthKit access token, which carries client_id and no aud claim.
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
  authkitDomain: "https://api.workos.com",
  organizationId: "org_123",
};

// Mirrors the claim set WorkOS documents for an AuthKit access token: an iss, a client_id,
// and no aud claim of any kind.
async function signAccessToken(
  claims: Record<string, unknown> = {},
  key: Uint8Array = signing.key
): Promise<string> {
  return new SignJWT({
    iss: CONFIG.authkitDomain,
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

describe("verifyToken against a real AuthKit-shaped token", () => {
  it("accepts a correctly signed token that carries no aud claim", async () => {
    const token = await signAccessToken();

    const result = await verifyToken(new Request("https://mcp.example.com"), token, CONFIG);

    expect(result).toEqual({
      token,
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("accepts a token whose issuer carries a trailing slash the config does not", async () => {
    const token = await signAccessToken({ iss: `${CONFIG.authkitDomain}/` });

    const result = await verifyToken(new Request("https://mcp.example.com"), token, CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  it("rejects a token from a different issuer domain", async () => {
    const token = await signAccessToken({ iss: "https://api.workos.example.net" });

    const result = await verifyToken(new Request("https://mcp.example.com"), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects a token minted for a different client", async () => {
    const token = await signAccessToken({ client_id: "client_someone_else" });

    const result = await verifyToken(new Request("https://mcp.example.com"), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects a token signed with a key the JWKS does not vouch for", async () => {
    const token = await signAccessToken({}, signing.otherKey);

    const result = await verifyToken(new Request("https://mcp.example.com"), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({
      iss: CONFIG.authkitDomain,
      client_id: CONFIG.clientId,
      org_id: CONFIG.organizationId,
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signing.key);

    const result = await verifyToken(new Request("https://mcp.example.com"), token, CONFIG);

    expect(result).toBeUndefined();
  });
});
