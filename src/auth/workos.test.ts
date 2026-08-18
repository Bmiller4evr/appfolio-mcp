// ABOUTME: Tests WorkOS bearer-token verification and org-role to owner/admin mapping.
// ABOUTME: jwtVerify itself is mocked, this tests our wiring, not the jose library.
import { describe, it, expect, vi } from "vitest";

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

  it("points the JWKS remote set at the AuthKit per-client JWKS path", async () => {
    const config = { ...CONFIG, authkitDomain: "https://jwks-path.example.com" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: config.authkitDomain }));

    await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", config);

    const urls = vi
      .mocked(createRemoteJWKSet)
      .mock.calls.map(([url]) => url as URL)
      .filter((url) => url.origin === "https://jwks-path.example.com");
    expect(urls).not.toHaveLength(0);
    for (const url of urls) {
      expect(url.pathname).toBe(`/sso/jwks/${config.clientId}`);
    }
  });

  it("returns undefined when the token was minted for a different client", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ client_id: "client_someone_else" }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("returns undefined for a token with no client_id claim", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ client_id: undefined }));

    const result = await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(result).toBeUndefined();
  });

  it("does not ask jose to validate an aud claim, since AuthKit tokens carry none", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith());

    await verifyToken(new Request("https://mcp.example.com"), "valid.jwt.token", CONFIG);

    expect(jwtVerify).toHaveBeenCalled();
    const options = vi.mocked(jwtVerify).mock.calls.at(-1)?.[2] ?? {};
    expect(options).not.toHaveProperty("audience");
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
      expect(url.pathname).toBe(`/sso/jwks/${config.clientId}`);
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
      .mock.calls.filter(
        ([url]) => url.toString() === `https://cache-test.example.com/sso/jwks/${config.clientId}`
      );
    expect(jwksCallsForDomain).toHaveLength(1);
  });

  it("builds a separate JWKS remote set per client on the same domain", async () => {
    const domain = "https://multi-client.example.com";
    const first = { ...CONFIG, authkitDomain: domain, clientId: "client_first" };
    const second = { ...CONFIG, authkitDomain: domain, clientId: "client_second" };
    vi.mocked(jwtVerify).mockResolvedValue(payloadWith({ iss: domain, client_id: undefined }));

    await verifyToken(new Request("https://mcp.example.com"), "token.one", first);
    await verifyToken(new Request("https://mcp.example.com"), "token.two", second);

    const paths = vi
      .mocked(createRemoteJWKSet)
      .mock.calls.map(([url]) => url as URL)
      .filter((url) => url.origin === domain)
      .map((url) => url.pathname);
    expect(paths).toEqual(["/sso/jwks/client_first", "/sso/jwks/client_second"]);
  });
});
