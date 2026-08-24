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

// The RFC 8707 resource indicator this server is reached at, which clients send as `resource`
// on the authorization request and the authorization server stamps into the token's aud.
// Derived from the request exactly as mcp-handler's protectedResourceHandler derives the
// `resource` it advertises (public origin behind any proxy), so the value we advertise and the
// value we demand can never disagree.
function resourceIdentifier(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0].trim();
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
    return `${proto}://${host}`;
  }
  const forwarded = req.headers.get("forwarded");
  if (forwarded) {
    const directives = new Map<string, string>();
    for (const pair of forwarded.split(",")[0].split(";")) {
      const [key, value] = pair.split("=").map((part) => part.trim().toLowerCase());
      if (key && value) directives.set(key, value.replace(/^"|"$/g, ""));
    }
    const host = directives.get("host");
    if (host) return `${directives.get("proto") || "https"}://${host}`;
  }
  return new URL(req.url).origin;
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
  if (!bearerToken) return undefined;

  const jwks = getJwks(config.authkitDomain);
  try {
    // jose does the aud comparison itself, which also covers an array-valued aud claim. A token
    // issued for some other resource server, or carrying no aud at all, fails here.
    const { payload } = await jwtVerify(bearerToken, jwks, { audience: resourceIdentifier(req) });

    // Checked here rather than through jose's `issuer` option, which demands an exact string
    // match and would reject a token differing only by a trailing slash.
    const issuer = payload.iss;
    if (typeof issuer !== "string" || !isSameIssuer(issuer, config.authkitDomain)) return undefined;

    // The `client_id` claim names the OAuth client the token was issued to. Requiring our own
    // application's client id is what stops a token issued to some other client, for a user of
    // our organization, from being replayed here. This is stricter than the aud check above:
    // a client registered dynamically through the authorization server's registration endpoint
    // gets its own client id and is refused, so the connector must use our configured client.
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
