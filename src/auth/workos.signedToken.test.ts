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

// The role lives in WorkOS's organization membership record, not in the token, so verifying a
// token makes a WorkOS API call. The SDK is replaced at the module boundary so the suite tests
// our own handling of what that call returns without reaching the real WorkOS API.
const workos = vi.hoisted(() => ({ listOrganizationMemberships: vi.fn() }));

vi.mock("@workos-inc/node", () => ({
  WorkOS: vi.fn(() => ({
    userManagement: { listOrganizationMemberships: workos.listOrganizationMemberships },
  })),
}));

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

// One active membership holding the admin role, which is what every test that is not about the
// membership lookup itself needs the lookup to return.
function membershipPage(slug: string) {
  return { data: [{ role: { slug } }] };
}

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  workos.listOrganizationMemberships.mockReset();
  workos.listOrganizationMemberships.mockResolvedValue(membershipPage("admin"));
});

afterEach(() => {
  consoleError.mockRestore();
});

// Mirrors the claim set a real AuthKit access token carries, as decoded from one issued to a
// live CIMD-registered connector: an iss, a client_id, and an aud holding the resource
// application's own WorkOS client id. There is no role claim, matching the claim set WorkOS
// documents for MCP access tokens.
async function signAccessToken(
  claims: Record<string, unknown> = {},
  key: Uint8Array = signing.key
): Promise<string> {
  return new SignJWT({
    iss: CONFIG.authkitDomain,
    aud: CONFIG.clientId,
    client_id: CONFIG.clientId,
    org_id: CONFIG.organizationId,
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

// WorkOS's documented claim set for an MCP access token is iss, aud, sub, org_id, scope, jti,
// iat and exp, with no role anywhere in it, so the role a caller holds comes from the
// organization membership WorkOS keeps for them.
describe("the organization role behind a verified token", () => {
  it("looks the role up for the token's own subject in our own organization", async () => {
    const token = await signAccessToken();

    await verifyToken(mcpRequest(), token, CONFIG);

    expect(workos.listOrganizationMemberships).toHaveBeenCalledTimes(1);
    expect(workos.listOrganizationMemberships.mock.calls[0][0]).toMatchObject({
      userId: "user_123",
      organizationId: CONFIG.organizationId,
    });
  });

  it("accepts a token whose subject holds the admin role in our organization", async () => {
    workos.listOrganizationMemberships.mockResolvedValue(membershipPage("admin"));
    const token = await signAccessToken();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toEqual({
      token,
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("gives a member of our organization the owner role", async () => {
    workos.listOrganizationMemberships.mockResolvedValue(membershipPage("member"));
    const token = await signAccessToken();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toEqual({
      token,
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "owner" },
    });
  });

  it("rejects a subject with no active membership in our organization", async () => {
    workos.listOrganizationMemberships.mockResolvedValue({ data: [] });
    const token = await signAccessToken();
    consoleError.mockClear();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
    expect(consoleError.mock.calls).toEqual([
      ["verifyToken: rejected, no active organization membership"],
    ]);
  });

  it("rejects a membership carrying no usable role slug", async () => {
    workos.listOrganizationMemberships.mockResolvedValue({ data: [{ role: { slug: "" } }] });
    const token = await signAccessToken();
    consoleError.mockClear();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
    expect(consoleError.mock.calls).toEqual([
      ["verifyToken: rejected, missing or invalid membership role"],
    ]);
  });

  // A WorkOS outage and a token that fails verification are different problems with different
  // fixes, so the log has to tell them apart rather than blaming jose for both.
  it("names the membership lookup, not jose, when the WorkOS call fails", async () => {
    workos.listOrganizationMemberships.mockRejectedValue(new Error("503 from WorkOS"));
    const token = await signAccessToken();
    consoleError.mockClear();

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
    expect(consoleError.mock.calls).toEqual([
      ["verifyToken: rejected, organization membership lookup failed"],
    ]);
  });

  it("does not look up a membership for a token it has already refused", async () => {
    const token = await signAccessToken({ org_id: "org_someone_else" });

    const result = await verifyToken(mcpRequest(), token, CONFIG);

    expect(result).toBeUndefined();
    expect(workos.listOrganizationMemberships).not.toHaveBeenCalled();
  });
});
