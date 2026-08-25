// ABOUTME: Verifies WorkOS AuthKit bearer tokens for the remote MCP connector and maps
// ABOUTME: WorkOS org role to our owner/admin role, since WorkOS knows identity, not our roles.
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Role } from "../config";

export interface WorkOSConfig {
  clientId: string;
  apiKey: string;
  authkitDomain: string;
  organizationId: string;
}

export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  extra: { userId: string; role: Role };
}

export function resolveRole(orgRole: string): Role {
  return orgRole === "admin" ? "admin" : "owner";
}

// jose caches JWKS fetches internally per remote-set instance, so we memoize the remote set
// itself rather than creating a fresh one (and losing that cache) on every call. The
// authorization server publishes one key set per issuer, so the domain alone keys the cache.
const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

// The path the authorization server's RFC 8414 discovery document names as its jwks_uri, e.g.
// {"jwks_uri": "https://<your-authkit-domain>/oauth2/jwks", ...}.
function getJwks(authkitDomain: string): ReturnType<typeof createRemoteJWKSet> {
  // Stripped for the same reason as the issuer comparison below: WorkOS's own documentation
  // is inconsistent about whether the configured domain carries a trailing slash, and one
  // would otherwise produce a double slash here that 404s against the real JWKS endpoint.
  const domain = authkitDomain.replace(/\/+$/, "");
  let jwks = jwksByDomain.get(domain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${domain}/oauth2/jwks`));
    jwksByDomain.set(domain, jwks);
  }
  return jwks;
}

// WorkOS's own documentation is inconsistent about whether the issuer carries a trailing
// slash, so compare with trailing slashes stripped rather than gambling on a byte-exact match.
// A different issuer domain still fails this comparison.
function isSameIssuer(tokenIssuer: string, configuredDomain: string): boolean {
  const strip = (value: string) => value.replace(/\/+$/, "");
  return strip(tokenIssuer) === strip(configuredDomain);
}

// Records which named check refused a token, and nothing else. The label is a fixed string
// chosen at the call site: never the token, the payload, a claim value, or an error, so this
// is safe to leave on in production and still tells an operator which check to look at.
function reject(label: string): undefined {
  console.error(`verifyToken: rejected, ${label}`);
  return undefined;
}

// jose validates the audience itself and signals a mismatch by throwing, so that one failure
// is told apart from every other jose failure by the claim name its error carries. Only the
// claim's name is read here, never its value.
function isAudienceFailure(err: unknown): boolean {
  const { code, claim } = (err ?? {}) as { code?: string; claim?: string };
  return code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && claim === "aud";
}

// Takes (req, bearerToken, config) rather than mcp-handler's withMcpAuth's expected
// (req, bearerToken) => AuthInfo | undefined shape, since config has no default value. Task 16
// must wrap this in a closure before passing it to withMcpAuth, not pass it directly, e.g.:
//   withMcpAuth(handler, (req, token) => verifyToken(req, token, config), opts)
export async function verifyToken(
  req: Request,
  bearerToken: string | undefined,
  config: WorkOSConfig
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return reject("no bearer token");

  const jwks = getJwks(config.authkitDomain);
  try {
    // Confirmed by decoding a real access token from a live CIMD-registered connector: WorkOS
    // stamps `aud` with our own WorkOS AuthKit application's client id, not the RFC 8707
    // `resource` value the client requested and not the connecting client's own (CIMD) client
    // id. jose does the aud comparison itself, which also covers an array-valued aud claim on
    // the token side. A token minted for a different WorkOS application fails here.
    const { payload } = await jwtVerify(bearerToken, jwks, { audience: config.clientId });

    // Checked here rather than through jose's `issuer` option, which demands an exact string
    // match and would reject a token differing only by a trailing slash.
    const issuer = payload.iss;
    if (typeof issuer !== "string" || !isSameIssuer(issuer, config.authkitDomain)) {
      return reject("issuer mismatch");
    }

    const userId = payload.sub;
    if (typeof userId !== "string" || !userId) return reject("missing or invalid sub claim");

    // This server serves one WorkOS organization (Bret's and Justin's), not open AuthKit
    // signup, so a token minted for any other organization is refused like any other
    // verification failure.
    if ((payload as { org_id?: string }).org_id !== config.organizationId) {
      return reject("org_id mismatch");
    }

    // AuthKit access tokens carry the organization role as `role`, not `org_role`. A token
    // with no role claim at all is refused rather than mapped to owner: a caller whose role
    // we cannot read is a caller we cannot scope.
    const orgRole = (payload as { role?: string }).role;
    if (typeof orgRole !== "string" || !orgRole) return reject("missing or invalid role claim");

    return {
      token: bearerToken,
      clientId: config.clientId,
      scopes: [],
      extra: { userId, role: resolveRole(orgRole) },
    };
  } catch (err) {
    if (isAudienceFailure(err)) return reject("audience mismatch");
    return reject("jose verification threw");
  }
}
