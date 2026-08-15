// ABOUTME: Verifies WorkOS AuthKit bearer tokens for the remote MCP connector and maps
// ABOUTME: WorkOS org role to our owner/admin role, since WorkOS knows identity, not our roles.
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Role } from "../config";

export interface WorkOSConfig {
  clientId: string;
  apiKey: string;
  authkitDomain: string;
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
// itself per AuthKit domain rather than creating a fresh one (and losing that cache) on every call.
const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(authkitDomain: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByDomain.get(authkitDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${authkitDomain}/oauth2/jwks`));
    jwksByDomain.set(authkitDomain, jwks);
  }
  return jwks;
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

  const jwks = getJwks(config.authkitDomain);
  try {
    const { payload } = await jwtVerify(bearerToken, jwks, {
      issuer: config.authkitDomain,
      audience: config.clientId,
    });
    const userId = payload.sub;
    if (typeof userId !== "string" || !userId) return undefined;
    const orgRole = (payload as { org_role?: string }).org_role ?? "member";
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
