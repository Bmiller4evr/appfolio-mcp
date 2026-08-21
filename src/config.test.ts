// ABOUTME: Tests env var parsing and validation for the server config module.
// ABOUTME: Covers required-vs-optional modules and fail-loudly-on-partial-config behavior.
import { describe, it, expect } from "vitest";
import { loadConfig, ConfigError } from "./config";

const BASE_ENV = {
  WORKOS_CLIENT_ID: "client_123",
  WORKOS_API_KEY: "sk_test_123",
  WORKOS_AUTHKIT_DOMAIN: "https://auth.example.com",
  WORKOS_ORGANIZATION_ID: "org_123",
  APPFOLIO_MCP_TOKEN_SECRET: "a".repeat(32),
};

describe("loadConfig", () => {
  it("throws ConfigError when WorkOS vars are missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("throws ConfigError when the WorkOS organization id is missing", () => {
    const { WORKOS_ORGANIZATION_ID: _omitted, ...env } = BASE_ENV;
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });

  it("populates the WorkOS organization id", () => {
    expect(loadConfig(BASE_ENV).workos.organizationId).toBe("org_123");
  });

  it("leaves reports config undefined when unset", () => {
    const config = loadConfig(BASE_ENV);
    expect(config.reports).toBeUndefined();
  });

  it("populates reports config when all three vars are set", () => {
    const config = loadConfig({
      ...BASE_ENV,
      APPFOLIO_DATABASE: "perpetualrealty",
      APPFOLIO_REPORTS_CLIENT_ID: "rid",
      APPFOLIO_REPORTS_CLIENT_SECRET: "rsecret",
    });
    expect(config.reports).toEqual({
      database: "perpetualrealty",
      clientId: "rid",
      clientSecret: "rsecret",
    });
  });

  it("throws ConfigError on a partially set reports module", () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, APPFOLIO_DATABASE: "perpetualrealty" })
    ).toThrow(ConfigError);
  });

  it("throws ConfigError when destructive is enabled without writes", () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        APPFOLIO_DEVELOPER_ID: "d",
        APPFOLIO_DB_CLIENT_ID: "c",
        APPFOLIO_DB_CLIENT_SECRET: "s",
        APPFOLIO_ENABLE_DESTRUCTIVE: "true",
      })
    ).toThrow(ConfigError);
  });

  it("parses writesEnabled and destructiveEnabled flags", () => {
    const config = loadConfig({
      ...BASE_ENV,
      APPFOLIO_DEVELOPER_ID: "d",
      APPFOLIO_DB_CLIENT_ID: "c",
      APPFOLIO_DB_CLIENT_SECRET: "s",
      APPFOLIO_ENABLE_WRITES: "true",
      APPFOLIO_ENABLE_DESTRUCTIVE: "true",
    });
    expect(config.writesEnabled).toBe(true);
    expect(config.destructiveEnabled).toBe(true);
  });
});
