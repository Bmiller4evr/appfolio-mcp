// ABOUTME: Parses and validates server configuration from environment variables.
// ABOUTME: Fails loudly on partial module config rather than silently disabling.
export type Role = "owner" | "admin";

export interface AppFolioReportsConfig {
  database: string;
  clientId: string;
  clientSecret: string;
}

export interface AppFolioDatabaseConfig {
  developerId: string;
  clientId: string;
  clientSecret: string;
}

export interface Config {
  workos: { clientId: string; apiKey: string; authkitDomain: string; organizationId: string };
  tokenSecret: string;
  reports?: AppFolioReportsConfig;
  database?: AppFolioDatabaseConfig;
  writesEnabled: boolean;
  destructiveEnabled: boolean;
  auditSlackWebhookUrl?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function requireVar(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new ConfigError(`Missing required env var: ${name}`);
  return value;
}

function readModule(
  env: NodeJS.ProcessEnv,
  names: string[],
  moduleName: string
): string[] | undefined {
  const values = names.map((n) => env[n]);
  const setCount = values.filter(Boolean).length;
  if (setCount === 0) return undefined;
  if (setCount < names.length) {
    throw new ConfigError(
      `${moduleName} is partially configured: set all of [${names.join(", ")}] or none of them`
    );
  }
  return values as string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const workos = {
    clientId: requireVar(env, "WORKOS_CLIENT_ID"),
    apiKey: requireVar(env, "WORKOS_API_KEY"),
    authkitDomain: requireVar(env, "WORKOS_AUTHKIT_DOMAIN"),
    organizationId: requireVar(env, "WORKOS_ORGANIZATION_ID"),
  };
  const tokenSecret = requireVar(env, "APPFOLIO_MCP_TOKEN_SECRET");

  const reportsVars = readModule(
    env,
    ["APPFOLIO_DATABASE", "APPFOLIO_REPORTS_CLIENT_ID", "APPFOLIO_REPORTS_CLIENT_SECRET"],
    "Reports API"
  );
  const reports: AppFolioReportsConfig | undefined = reportsVars
    ? { database: reportsVars[0], clientId: reportsVars[1], clientSecret: reportsVars[2] }
    : undefined;

  const dbVars = readModule(
    env,
    ["APPFOLIO_DEVELOPER_ID", "APPFOLIO_DB_CLIENT_ID", "APPFOLIO_DB_CLIENT_SECRET"],
    "Database API"
  );
  const database: AppFolioDatabaseConfig | undefined = dbVars
    ? { developerId: dbVars[0], clientId: dbVars[1], clientSecret: dbVars[2] }
    : undefined;

  const writesEnabled = env.APPFOLIO_ENABLE_WRITES === "true";
  const destructiveEnabled = env.APPFOLIO_ENABLE_DESTRUCTIVE === "true";
  if (destructiveEnabled && !writesEnabled) {
    throw new ConfigError("APPFOLIO_ENABLE_DESTRUCTIVE requires APPFOLIO_ENABLE_WRITES=true");
  }

  return {
    workos,
    tokenSecret,
    reports,
    database,
    writesEnabled,
    destructiveEnabled,
    auditSlackWebhookUrl: env.APPFOLIO_AUDIT_SLACK_WEBHOOK_URL,
  };
}
