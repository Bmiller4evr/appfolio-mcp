// ABOUTME: Tests WorkOS bearer-token verification and org-role to owner/admin mapping.
// ABOUTME: jwtVerify itself is mocked, this tests our wiring, not the jose library.
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "JWKS_PLACEHOLDER"),
  jwtVerify: vi.fn(),
}));

import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyToken, resolveRole } from "./workos";

const CONFIG = {
  clientId: "client_123",
  apiKey: "sk_test",
  authkitDomain: "https://auth.example.com",
  organizationId: "org_123",
};

// The resource identifier every test's request resolves to, which is also the audience the
// authorization server stamps on a token issued for that RFC 8707 resource parameter.
const RESOURCE = "https://mcp.example.com";

// verifyToken reports every rejection through console.error, so the spy both keeps the suite's
// output pristine and gives the logging tests below the exact arguments each path passed.
let consoleError: MockInstance;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
      aud: RESOURCE,
      client_id: CONFIG.clientId,
      sub: "user_123",
      org_id: "org_123",
      role: "admin",
      ...overrides,
    },
  } as any;
}

describe("verifyToken", () => {
  it("returns undefined when no bearer token is present", async () => {
    const result = await verifyToken(new Request("https://mcp.example.com"), undefined, CONFIG);
    expect(result).toBeUndefined();
  });

  it("returns AuthInfo with the resolved role in extra, for a valid token", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

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

  it("maps a non-admin role claim to owner", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ role: "member" }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "owner" },
    });
  });

  it("returns undefined when the token has no role claim at all", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ role: undefined }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a token from another organization", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ org_id: "org_someone_else" }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a token with no organization claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ org_id: undefined }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined when jose rejects the token over a claim it validates itself", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(
      new Error('JWTExpired: "exp" claim timestamp check failed')
    );

    const result = await verifyToken(
      new Request("https://mcp.example.com"),
      "expired.jwt.token",
      CONFIG
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when the token payload has no sub claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ sub: undefined }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("points the JWKS remote set at the jwks_uri path the authorization server publishes", async () => {
    const config = { ...CONFIG, authkitDomain: "https://jwks-path.example.com" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: config.authkitDomain }));

    await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", config);

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

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("accepts a token with no client_id claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ client_id: undefined }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result?.extra.userId).toBe("user_123");
  });

  it("asks jose to validate the aud claim against the resource this server is reached at, tolerating a trailing slash", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    await verifyToken(new Request("https://mcp.example.com/api/mcp"), "valid.jwt.token", CONFIG);

    expect(jwtVerify).toHaveBeenCalled();
    const options = vi.mocked(jwtVerify).mock.calls.at(-1)?.[2] ?? {};
    expect(options).toHaveProperty("audience", [RESOURCE, `${RESOURCE}/`]);
  });

  it("takes the expected audience from the forwarded host a proxy puts the server behind", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    await verifyToken(
      new Request("http://localhost:3000/api/mcp", {
        headers: { "x-forwarded-host": "public.example.com", "x-forwarded-proto": "https" },
      }),
      "valid.jwt.token",
      CONFIG
    );

    const options = vi.mocked(jwtVerify).mock.calls.at(-1)?.[2] ?? {};
    expect(options).toHaveProperty("audience", ["https://public.example.com", "https://public.example.com/"]);
  });

  it("takes the expected audience from an RFC 7239 Forwarded header when that is all a proxy sends", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    await verifyToken(
      new Request("http://localhost:3000/api/mcp", {
        headers: { forwarded: 'proto=https;host="public.example.com", proto=http;host=hop-two.example.com' },
      }),
      "valid.jwt.token",
      CONFIG
    );

    const options = vi.mocked(jwtVerify).mock.calls.at(-1)?.[2] ?? {};
    expect(options).toHaveProperty("audience", ["https://public.example.com", "https://public.example.com/"]);
  });

  it("builds a JWKS URL with no double slash when authkitDomain has a trailing slash", async () => {
    const config = { ...CONFIG, authkitDomain: "https://trailing-slash.example.com/" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: "https://trailing-slash.example.com" }));

    await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", config);

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

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toEqual({
      token: "valid.jwt.token",
      clientId: "client_123",
      scopes: [],
      extra: { userId: "user_123", role: "admin" },
    });
  });

  it("returns undefined for a token from a genuinely different issuer domain", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: "https://auth.attacker.example.com" }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined when the token carries no issuer claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: undefined }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("reuses the cached JWKS remote set across multiple calls for the same config", async () => {
    const config = { ...CONFIG, authkitDomain: "https://cache-test.example.com" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: config.authkitDomain }));

    await verifyToken(new Request("https://mcp.example.com"), "token.one", config);
    await verifyToken(new Request("https://mcp.example.com"), "token.two", config);

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

    await verifyToken(new Request("https://mcp.example.com"), "token.one", first);
    await verifyToken(new Request("https://mcp.example.com"), "token.two", second);

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
    "verifyToken: rejected, missing or invalid role claim",
  ];

  // Values that must never reach a log: the token itself and every claim value the scenarios
  // below feed in.
  const TOKEN = "secret.header.secret-payload.secret-signature";
  const CLAIM_VALUES = [
    "user_123",
    "org_someone_else",
    "https://auth.attacker.example.com",
    "client_someone_else",
    "admin",
  ];

  async function logsFor(payload: Record<string, unknown>): Promise<unknown[][]> {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith(payload));
    consoleError.mockClear();
    await verifyToken(new Request(RESOURCE), TOKEN, CONFIG);
    return consoleError.mock.calls;
  }

  it("names the missing bearer token", async () => {
    consoleError.mockClear();
    await verifyToken(new Request(RESOURCE), undefined, CONFIG);
    expect(consoleError.mock.calls).toEqual([["verifyToken: rejected, no bearer token"]]);
  });

  it("names a throw out of jose", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature verification failed"));
    consoleError.mockClear();

    await verifyToken(new Request(RESOURCE), TOKEN, CONFIG);

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

  it("names the role check", async () => {
    expect(await logsFor({ role: undefined })).toEqual([
      ["verifyToken: rejected, missing or invalid role claim"],
    ]);
  });

  it("logs nothing at all for a token it accepts", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());
    consoleError.mockClear();

    await verifyToken(new Request(RESOURCE), TOKEN, CONFIG);

    expect(consoleError.mock.calls).toEqual([]);
  });

  it("logs only a fixed label, never the token, a claim value, or the payload", async () => {
    const logged: unknown[] = [];
    for (const payload of [
      { iss: "https://auth.attacker.example.com" },
      { sub: undefined },
      { org_id: "org_someone_else" },
      { role: undefined },
      { client_id: "client_someone_else", org_id: "org_someone_else" },
    ]) {
      logged.push(...(await logsFor(payload)).flat());
    }
    vi.mocked(jwtVerify).mockRejectedValue(new Error(`invalid signature on ${TOKEN}`));
    consoleError.mockClear();
    await verifyToken(new Request(RESOURCE), TOKEN, CONFIG);
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
