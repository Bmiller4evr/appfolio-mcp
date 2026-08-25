// ABOUTME: Tests WorkOS bearer-token verification and org-role to owner/admin mapping.
// ABOUTME: jwtVerify itself is mocked, this tests our wiring, not the jose library.
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "JWKS_PLACEHOLDER"),
  jwtVerify: vi.fn(),
}));

// The role comes from the caller's WorkOS organization membership, so verifying a token calls
// the WorkOS API. The SDK is replaced at the module boundary rather than reached over the wire.
const workos = vi.hoisted(() => ({ listOrganizationMemberships: vi.fn() }));

vi.mock("@workos-inc/node", () => ({
  WorkOS: vi.fn(() => ({
    userManagement: { listOrganizationMemberships: workos.listOrganizationMemberships },
  })),
}));

import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyToken, resolveRole } from "./workos";

const CONFIG = {
  clientId: "client_123",
  apiKey: "sk_test",
  authkitDomain: "https://auth.example.com",
  organizationId: "org_123",
};

// The request verifyToken is handed. Nothing about it decides whether a token is accepted:
// every check reads the token's own claims and the config, never the request.
function mcpRequest(): Request {
  return new Request("https://mcp.example.com/api/mcp");
}

// verifyToken reports every rejection through console.error, so the spy both keeps the suite's
// output pristine and gives the logging tests below the exact arguments each path passed.
let consoleError: MockInstance;

// The page the WorkOS API returns for a caller who holds one active membership in our
// organization. Tests that are about a different check leave this at the admin role.
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

describe("resolveRole", () => {
  it("maps the WorkOS admin org role to admin", () => {
    expect(resolveRole("admin")).toBe("admin");
  });

  it("maps any other org role to owner", () => {
    expect(resolveRole("member")).toBe("owner");
  });
});

// The claims a genuine AuthKit access token carries. Individual tests override or drop one
// claim so each exercises the check it names rather than tripping an earlier one.
function payloadWith(overrides: Record<string, unknown> = {}) {
  return {
    payload: {
      iss: CONFIG.authkitDomain,
      aud: CONFIG.clientId,
      client_id: CONFIG.clientId,
      sub: "user_123",
      org_id: "org_123",
      ...overrides,
    },
  } as any;
}

describe("verifyToken", () => {
  it("returns undefined when no bearer token is present", async () => {
    const result = await verifyToken(mcpRequest(), undefined, CONFIG);
    expect(result).toBeUndefined();
  });

  it("returns AuthInfo with the resolved role in extra, for a valid token", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("returns undefined when jwtVerify rejects an invalid token", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature invalid"));
    const result = await verifyToken(mcpRequest(), "garbage", CONFIG);
    expect(result).toBeUndefined();
  });

  it("maps a non-admin membership role to owner", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    workos.listOrganizationMemberships.mockResolvedValue(membershipPage("member"));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "owner" },
    });
  });

  it("returns undefined when the caller holds no active membership in our organization", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    workos.listOrganizationMemberships.mockResolvedValue({ data: [] });

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined when the WorkOS membership lookup fails", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    workos.listOrganizationMemberships.mockRejectedValue(new Error("503 from WorkOS"));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a token from another organization", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ org_id: "org_someone_else" }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a token with no organization claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ org_id: undefined }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined when jose rejects the token over a claim it validates itself", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new Error('JWTExpired: "exp" claim timestamp check failed')
    );

    const result = await verifyToken(mcpRequest(), "expired.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined when the token payload has no sub claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ sub: undefined }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("points the JWKS remote set at the jwks_uri path the authorization server publishes", async () => {
    const config = { ...CONFIG, authkitDomain: "https://jwks-path.example.com" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: config.authkitDomain }));

    await verifyToken(mcpRequest(), "valid.jwt.token", config);

    const urls = vi
      .mocked(createRemoteJWKSet)
      .mock.calls.map(([url]) => url as URL)
      .filter((url) => url.origin === "https://jwks-path.example.com");
    expect(urls).not.toHaveLength(0);
    for (const url of urls) {
      expect(url.pathname).toBe("/oauth2/jwks");
      expect(url.pathname).not.toContain(config.clientId);
    }
  });

  // A connector that registers itself through a client id metadata document is issued its own
  // client id, which is never our configured one. The aud and org_id checks are what bound this
  // token, so such a client is accepted.
  it("accepts a token minted for a dynamically registered client of our organization", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ client_id: "https://claude.ai/.well-known/oauth-client" }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("accepts a token with no client_id claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ client_id: undefined }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  // A real access token from a live CIMD-registered connector was decoded and carried our own
  // WorkOS application's client id in aud, so that is the single value jose is asked to match.
  it("asks jose to validate the aud claim against our WorkOS application's client id", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(jwtVerify).toHaveBeenCalled();
    const options = vi.mocked(jwtVerify).mock.calls.at(-1)?.[2] ?? {};
    expect(options).toHaveProperty("audience", CONFIG.clientId);
  });

  it("asks for the same audience whatever host and proxy headers the request carries", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    await verifyToken(
      new Request("http://localhost:3000/api/mcp", {
        headers: {
          "x-forwarded-host": "public.example.com",
          "x-forwarded-proto": "https",
          forwarded: 'proto=https;host="another.example.com"',
        },
      }),
      "valid.jwt.token",
      CONFIG
    );

    const options = vi.mocked(jwtVerify).mock.calls.at(-1)?.[2] ?? {};
    expect(options).toHaveProperty("audience", CONFIG.clientId);
  });

  it("builds a JWKS URL with no double slash when authkitDomain has a trailing slash", async () => {
    const config = { ...CONFIG, authkitDomain: "https://trailing-slash.example.com/" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: "https://trailing-slash.example.com" }));

    await verifyToken(mcpRequest(), "valid.jwt.token", config);

    const urls = vi
      .mocked(createRemoteJWKSet)
      .mock.calls.map(([url]) => url as URL)
      .filter((url) => url.origin === "https://trailing-slash.example.com");
    expect(urls).not.toHaveLength(0);
    for (const url of urls) {
      expect(url.pathname).toBe("/oauth2/jwks");
    }
  });

  it("accepts an issuer that differs from the configured domain only by a trailing slash", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: `${CONFIG.authkitDomain}/` }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("returns undefined for a token from a genuinely different issuer domain", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: "https://auth.attacker.example.com" }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined when the token carries no issuer claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: undefined }));

    const result = await verifyToken(mcpRequest(), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("reuses the cached JWKS remote set across multiple calls for the same config", async () => {
    const config = { ...CONFIG, authkitDomain: "https://cache-test.example.com" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: config.authkitDomain }));

    await verifyToken(mcpRequest(), "token.one", config);
    await verifyToken(mcpRequest(), "token.two", config);

    const jwksCallsForDomain = vi
      .mocked(createRemoteJWKSet)
      .mock.calls.filter(([url]) => url.toString() === "https://cache-test.example.com/oauth2/jwks");
    expect(jwksCallsForDomain).toHaveLength(1);
  });

  it("shares one JWKS remote set across clients on the same domain", async () => {
    const domain = "https://multi-client.example.com";
    const first = { ...CONFIG, authkitDomain: domain, clientId: "client_first" };
    const second = { ...CONFIG, authkitDomain: domain, clientId: "client_second" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: domain }));

    await verifyToken(mcpRequest(), "token.one", first);
    await verifyToken(mcpRequest(), "token.two", second);

    const urls = vi
      .mocked(createRemoteJWKSet)
      .mock.calls.map(([url]) => url as URL)
      .filter((url) => url.origin === domain)
      .map((url) => url.toString());
    expect(urls).toEqual([`${domain}/oauth2/jwks`]);
  });
});

// Every check that can refuse a token says which check it was, so an operator reading a
// production log knows why a real connector is getting 401s without having to guess.
describe("verifyToken rejection logging", () => {
  // The complete set of messages verifyToken is allowed to emit. Each is a fixed string with
  // nothing interpolated into it, which is what keeps the log safe to leave on in production.
  const LABELS = [
    "verifyToken: rejected, no bearer token",
    "verifyToken: rejected, jose verification threw",
    "verifyToken: rejected, audience mismatch",
    "verifyToken: rejected, issuer mismatch",
    "verifyToken: rejected, missing or invalid sub claim",
    "verifyToken: rejected, org_id mismatch",
    "verifyToken: rejected, organization membership lookup failed",
    "verifyToken: rejected, no active organization membership",
    "verifyToken: rejected, missing or invalid membership role",
  ];

  // Values that must never reach a log: the token itself, the WorkOS API key, and every claim
  // value the scenarios below feed in.
  const TOKEN = "secret.header.secret-payload.secret-signature";
  const CLAIM_VALUES = [
    "user_123",
    "org_someone_else",
    "https://auth.attacker.example.com",
    "client_someone_else",
    "admin",
    CONFIG.apiKey,
  ];

  async function logsFor(payload: Record<string, unknown>): Promise<unknown[][]> {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith(payload));
    consoleError.mockClear();
    await verifyToken(mcpRequest(), TOKEN, CONFIG);
    return consoleError.mock.calls;
  }

  it("names the missing bearer token", async () => {
    consoleError.mockClear();
    await verifyToken(mcpRequest(), undefined, CONFIG);
    expect(consoleError.mock.calls).toEqual([["verifyToken: rejected, no bearer token"]]);
  });

  it("names a throw out of jose", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature verification failed"));
    consoleError.mockClear();

    await verifyToken(mcpRequest(), TOKEN, CONFIG);

    expect(consoleError.mock.calls).toEqual([["verifyToken: rejected, jose verification threw"]]);
  });

  it("names the issuer check", async () => {
    expect(await logsFor({ iss: "https://auth.attacker.example.com" })).toEqual([
      ["verifyToken: rejected, issuer mismatch"],
    ]);
  });

  it("names the sub check", async () => {
    expect(await logsFor({ sub: undefined })).toEqual([
      ["verifyToken: rejected, missing or invalid sub claim"],
    ]);
  });

  it("names the org_id check", async () => {
    expect(await logsFor({ org_id: "org_someone_else" })).toEqual([
      ["verifyToken: rejected, org_id mismatch"],
    ]);
  });

  it("names the membership lookup when the WorkOS call fails", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    workos.listOrganizationMemberships.mockRejectedValue(new Error("503 from WorkOS"));
    consoleError.mockClear();

    await verifyToken(mcpRequest(), TOKEN, CONFIG);

    expect(consoleError.mock.calls).toEqual([
      ["verifyToken: rejected, organization membership lookup failed"],
    ]);
  });

  it("names the membership check when the caller belongs to no active membership", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    workos.listOrganizationMemberships.mockResolvedValue({ data: [] });
    consoleError.mockClear();

    await verifyToken(mcpRequest(), TOKEN, CONFIG);

    expect(consoleError.mock.calls).toEqual([
      ["verifyToken: rejected, no active organization membership"],
    ]);
  });

  it("logs nothing at all for a token it accepts", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    consoleError.mockClear();

    await verifyToken(mcpRequest(), TOKEN, CONFIG);

    expect(consoleError.mock.calls).toEqual([]);
  });

  it("logs only a fixed label, never the token, a claim value, or the payload", async () => {
    const logged: unknown[] = [];
    for (const payload of [
      { iss: "https://auth.attacker.example.com" },
      { sub: undefined },
      { org_id: "org_someone_else" },
      { client_id: "client_someone_else", org_id: "org_someone_else" },
    ]) {
      logged.push(...(await logsFor(payload)).flat());
    }
    workos.listOrganizationMemberships.mockRejectedValue(new Error(`lookup for ${TOKEN} failed`));
    logged.push(...(await logsFor({})).flat());
    workos.listOrganizationMemberships.mockResolvedValue({ data: [] });
    logged.push(...(await logsFor({})).flat());
    vi.mocked(jwtVerify).mockRejectedValue(new Error(`invalid signature on ${TOKEN}`));
    consoleError.mockClear();
    await verifyToken(mcpRequest(), TOKEN, CONFIG);
    logged.push(...consoleError.mock.calls.flat());

    expect(logged).not.toHaveLength(0);
    for (const argument of logged) {
      expect(typeof argument).toBe("string");
      expect(LABELS).toContain(argument);
      expect(argument as string).not.toContain(TOKEN);
      for (const value of CLAIM_VALUES) {
        expect(argument as string).not.toContain(value);
      }
    }
  });
});
