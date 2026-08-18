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
// itself rather than creating a fresh one (and losing that cache) on every call. AuthKit
// publishes one key set per client, so the cache is keyed by both domain and client id.
const jwksByClient = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(authkitDomain: string, clientId: string): ReturnType<typeof createRemoteJWKSet> {
  const cacheKey = `${authkitDomain}:${clientId}`;
  let jwks = jwksByClient.get(cacheKey);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${authkitDomain}/sso/jwks/${clientId}`));
    jwksByClient.set(cacheKey, jwks);
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

// Takes (req, bearerToken, config) rather than mcp-handler's withMcpAuth's expected
// (req, bearerToken) => AuthInfo | undefined shape, since config has no default value. Task 16
// must wrap this in a closure before passing it to withMcpAuth, not pass it directly, e.g.:
//   withMcpAuth(handler, (req, token) => verifyToken(req, token, config), opts)
export async function verifyToken(
  _req: Request,
  bearerToken: string | undefined,
  config: WorkOSConfig
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const jwks = getJwks(config.authkitDomain, config.clientId);
  try {
    const { payload } = await jwtVerify(bearerToken, jwks);

    // Checked here rather than through jose's `issuer` option, which demands an exact string
    // match and would reject a token differing only by a trailing slash.
    const issuer = payload.iss;
    if (typeof issuer !== "string" || !isSameIssuer(issuer, config.authkitDomain)) return undefined;

    // AuthKit access tokens identify the application with a `client_id` claim and carry no
    // `aud` claim at all, so this is what rejects a token minted for a different WorkOS client.
    if ((payload as { client_id?: string }).client_id !== config.clientId) return undefined;

    const userId = payload.sub;
    if (typeof userId !== "string" || !userId) return undefined;

    // This server serves one WorkOS organization (Bret's and Justin's), not open AuthKit
    // signup, so a token minted for any other organization is refused like any other
    // verification failure.
    if ((payload as { org_id?: string }).org_id !== config.organizationId) return undefined;

    // AuthKit access tokens carry the organization role as `role`, not `org_role`. A token
    // with no role claim at all is refused rather than mapped to owner: a caller whose role
    // we cannot read is a caller we cannot scope.
    const orgRole = (payload as { role?: string }).role;
    if (typeof orgRole !== "string" || !orgRole) return undefined;

    return {
      token: bearerToken,
      clientId: config.clientId,
      scopes: [],
      extra: { userId, role: resolveRole(orgRole) },
    };
  } catch {
    return undefined;
  }
}
