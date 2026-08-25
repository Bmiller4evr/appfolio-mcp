// ABOUTME: Verifies bearer tokens through the real jose library using a locally signed token
// ABOUTME: shaped like a real AuthKit access token, carrying our own WorkOS client id as aud.
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

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

// The URL this server is reached at. It is not part of any check: it appears below only as the
// request verifyToken is handed, and as an aud value a token must not be accepted for.
const SERVER_URL = "https://mcp.example.com/api/mcp";

function mcpRequest(): Request {
  return new Request(SERVER_URL);
}

// verifyToken reports every rejection through console.error, so the spy both keeps the suite's
// output pristine and gives the audience test below the exact arguments that path passed.
let consoleError: MockInstance;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

// Mirrors the claim set a real AuthKit access token carries, as decoded from one issued to a
// live CIMD-registered connector: an iss, a client_id, and an aud holding the resource
// application's own WorkOS client id.
async function signAccessToken(
  claims: Record<string, unknown> = {},
  key: Uint8Array = signing.key
): Promise<string> {
  return new SignJWT({
    iss: CONFIG.authkitDomain,
    aud: CONFIG.clientId,
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
  it("accepts a correctly signed token whose aud is our WorkOS application's client id", async () => {
    const token = await signAccessToken();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toEqual({
      token,
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("accepts a token whose aud is an array containing our client id", async () => {
    const token = await signAccessToken({ aud: ["https://other.example.com", CONFIG.clientId] });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  it("rejects a token minted for another WorkOS application", async () => {
    const token = await signAccessToken({ aud: "client_someone_else" });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  // The URL a client asks for as its RFC 8707 resource is not what WorkOS puts in aud, so a
  // token carrying it there is a token minted for something other than this application.
  it("rejects a token whose aud is the URL this server is reached at", async () => {
    const token = await signAccessToken({ aud: SERVER_URL });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects a token carrying no aud claim at all", async () => {
    const token = await signAccessToken({ aud: undefined });
    consoleError.mockClear();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
    expect(consoleError.mock.calls).toEqual([["verifyToken: rejected, audience mismatch"]]);
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

  // A connector registered through a client id metadata document holds its own client id, so
  // the token it presents carries a client_id that is not our configured one. Its aud and
  // org_id still bind it to this application and this organization, which is what decides it.
  it("accepts a token minted for a dynamically registered client of our organization", async () => {
    const token = await signAccessToken({ client_id: "https://claude.ai/.well-known/oauth-client" });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  it("names the audience check when jose refuses a token minted for another application", async () => {
    const token = await signAccessToken({ aud: "client_someone_else" });
    consoleError.mockClear();

    await verifyToken(mcpRequest(), token, CONFIG);

    expect(consoleError.mock.calls).toEqual([["verifyToken: rejected, audience mismatch"]]);
  });

  it("rejects a token signed with a key the JWKS does not vouch for", async () => {
    const token = await signAccessToken({}, signing.otherKey);

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({
      iss: CONFIG.authkitDomain,
      aud: CONFIG.clientId,
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
