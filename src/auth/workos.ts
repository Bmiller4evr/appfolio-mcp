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

export async function verifyToken(
  _req: Request,
  bearerToken: string | undefined,
  config: WorkOSConfig
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const jwks = createRemoteJWKSet(new URL(`${config.authkitDomain}/oauth2/jwks`));
  try {
    const { payload } = await jwtVerify(bearerToken, jwks, {
      issuer: config.authkitDomain,
    });
    const userId = payload.sub as string;
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
