# AppFolio MCP Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a remote MCP server (Next.js on Vercel) giving Claude read access to AppFolio's Reports and Database APIs, role-scoped human-confirmed write access, and four hand-written composite tools, gated by WorkOS AuthKit.

**Architecture:** Transport-agnostic tool logic (`src/`) wired into a single Next.js route handler (`app/api/mcp/route.ts`) via Vercel's `mcp-handler` package. AppFolio's 151-operation Database API catalog is generated once from AppFolio's own OpenAPI export and committed as data; a role-scope layer classifies every operation as `owner`+`admin` or `admin`-only, and as discoverable-but-uncallable vs. fully hidden. Writes are a stateless preview/confirm pair — the confirm token is a signed encoding of the exact request, not a server-side session, because Vercel functions don't share memory across invocations.

**Tech Stack:** TypeScript, Next.js (App Router), `mcp-handler`, `@modelcontextprotocol/sdk`, `zod`, `@workos-inc/node`, `jose`, `vitest`.

## Global Constraints

- No `console.log` of AppFolio credentials or WorkOS secrets, anywhere, including error messages.
- Every module starts with a 2-line `// ABOUTME:` comment per repo convention.
- All AppFolio HTTP calls go through `src/http.ts` — no direct `fetch` calls to `api.appfolio.com` or `*.appfolio.com` elsewhere.
- Destructive operations (`DELETE`, any `bulk_*`) are `admin`-only regardless of any other flag, and require `APPFOLIO_ENABLE_DESTRUCTIVE=true` in addition to `APPFOLIO_ENABLE_WRITES=true`.
- The confirm-token design MUST be stateless (self-verifying, no server-side pending-write store) — Vercel serverless functions do not share memory between the preview call and the confirm call, which may hit different instances.
- Composites are read-only forever — no exceptions. Any write goes through `call_endpoint`/`confirm_write`.

---

## Task 1: Project scaffold + config module

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config`, `ConfigError` class, and the `Config`/`Role` types every later task imports from `src/config.ts`.

- [ ] **Step 1: Scaffold the project**

```bash
npm init -y
npm install next@latest react@latest react-dom@latest mcp-handler @modelcontextprotocol/sdk zod @workos-inc/node jose
npm install -D typescript vitest @types/node tsx
```

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run",
    "generate:catalog": "tsx scripts/generate-database-catalog.ts"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "app", "scripts", "vitest.config.ts"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
export default {};
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

`.gitignore`:
```
node_modules/
.next/
.env.local
```

`.env.example`:
```bash
# Connector auth (required)
WORKOS_CLIENT_ID=
WORKOS_API_KEY=
WORKOS_AUTHKIT_DOMAIN=

# Confirm-token signing secret (required) — generate with: openssl rand -hex 32
APPFOLIO_MCP_TOKEN_SECRET=

# Reports API (optional module — omit all three to disable)
APPFOLIO_DATABASE=
APPFOLIO_REPORTS_CLIENT_ID=
APPFOLIO_REPORTS_CLIENT_SECRET=

# Database API (optional module — omit all three to disable)
APPFOLIO_DEVELOPER_ID=
APPFOLIO_DB_CLIENT_ID=
APPFOLIO_DB_CLIENT_SECRET=

# Write gating (both default off)
APPFOLIO_ENABLE_WRITES=false
APPFOLIO_ENABLE_DESTRUCTIVE=false

# Audit logging (optional — writes proceed unlogged if omitted, so set this)
APPFOLIO_AUDIT_SLACK_WEBHOOK_URL=
```

- [ ] **Step 2: Write the failing config tests**

```ts
// src/config.test.ts
// ABOUTME: Tests env var parsing and validation for the server config module.
// ABOUTME: Covers required-vs-optional modules and fail-loudly-on-partial-config behavior.
import { describe, it, expect } from "vitest";
import { loadConfig, ConfigError } from "./config";

const BASE_ENV = {
  WORKOS_CLIENT_ID: "client_123",
  WORKOS_API_KEY: "sk_test_123",
  WORKOS_AUTHKIT_DOMAIN: "https://auth.example.com",
  APPFOLIO_MCP_TOKEN_SECRET: "a".repeat(32),
};

describe("loadConfig", () => {
  it("throws ConfigError when WorkOS vars are missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 4: Implement `src/config.ts`**

```ts
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
  workos: { clientId: string; apiKey: string; authkitDomain: string };
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
      `${moduleName} is partially configured — set all of [${names.join(", ")}] or none of them`
    );
  }
  return values as string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const workos = {
    clientId: requireVar(env, "WORKOS_CLIENT_ID"),
    apiKey: requireVar(env, "WORKOS_API_KEY"),
    authkitDomain: requireVar(env, "WORKOS_AUTHKIT_DOMAIN"),
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: project scaffold and config module"
```

---

## Task 2: AppFolio HTTP client

**Files:**
- Create: `src/http.ts`
- Test: `src/http.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `AppFolioHttpClient` class with `.request(method, path, opts?)`, `AppFolioHttpError` — used by every tool in `src/database/` and `src/reports/`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/http.test.ts
// ABOUTME: Tests the shared AppFolio HTTP client — auth headers, retry, error handling.
import { describe, it, expect, vi } from "vitest";
import { AppFolioHttpClient, AppFolioHttpError } from "./http";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AppFolioHttpClient", () => {
  it("sends Basic auth and developer ID headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "client-id",
      password: "client-secret",
      developerId: "dev-123",
      fetchImpl,
    });

    await client.request("GET", "/tenants");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.appfolio.com/api/v0/tenants");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    expect(headers["X-AppFolio-Developer-ID"]).toBe("dev-123");
  });

  it("appends query params", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
    });

    await client.request("GET", "/tenants", { query: { page: "2" } });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.appfolio.com/api/v0/tenants?page=2");
  });

  it("retries on 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
      retryDelayMs: 1,
    });

    const result = await client.request("GET", "/tenants");

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws AppFolioHttpError after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("server error", { status: 500 }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
      retryDelayMs: 1,
      maxRetries: 2,
    });

    await expect(client.request("GET", "/tenants")).rejects.toThrow(AppFolioHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry on 4xx other than 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    const client = new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: "u",
      password: "p",
      fetchImpl,
    });

    await expect(client.request("GET", "/tenants/999")).rejects.toThrow(AppFolioHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/http.test.ts`
Expected: FAIL — `Cannot find module './http'`

- [ ] **Step 3: Implement `src/http.ts`**

```ts
// ABOUTME: Shared HTTP client for both AppFolio APIs — Basic auth, retry/backoff, pagination.
// ABOUTME: Every AppFolio network call in this codebase goes through here, nowhere else.
export interface AppFolioHttpClientOptions {
  baseUrl: string;
  username: string;
  password: string;
  developerId?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class AppFolioHttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`AppFolio request failed with ${status}: ${body}`);
    this.name = "AppFolioHttpError";
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class AppFolioHttpClient {
  private baseUrl: string;
  private authHeader: string;
  private developerId?: string;
  private fetchImpl: typeof fetch;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(opts: AppFolioHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.authHeader = `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString("base64")}`;
    this.developerId = opts.developerId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
  }

  async request(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown } = {}
  ): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "content-type": "application/json",
    };
    if (this.developerId) headers["X-AppFolio-Developer-ID"] = this.developerId;

    let attempt = 0;
    for (;;) {
      const response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

      if (response.ok) {
        if (response.status === 204) return undefined;
        return response.json();
      }

      const shouldRetry = RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries;
      if (!shouldRetry) {
        const body = await response.text();
        throw new AppFolioHttpError(response.status, body);
      }

      attempt++;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/http.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: AppFolio HTTP client with retry and Basic auth"
```

---

## Task 3: Catalog engine (shared descriptor registry)

**Files:**
- Create: `src/catalog/types.ts`, `src/catalog/registry.ts`
- Test: `src/catalog/registry.test.ts`

**Interfaces:**
- Produces: `Descriptor` interface, `search<T>(items, query?)`, `describe<T>(items, id)` — used by both `src/database/tools.ts` and `src/reports/tools.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/catalog/registry.test.ts
// ABOUTME: Tests the generic search/describe registry shared by reports and database catalogs.
import { describe, it, expect } from "vitest";
import { search, describe as describeItem } from "./registry";
import type { Descriptor } from "./types";

const ITEMS: Descriptor[] = [
  { id: "rent_roll", title: "Rent Roll", summary: "Occupancy and rent by unit", tags: ["occupancy"] },
  { id: "delinquency", title: "Delinquency", summary: "Aging balances by tenant", tags: ["financial"] },
  { id: "work_orders", title: "Work Orders", summary: "Open and closed maintenance tickets", tags: ["maintenance"] },
];

describe("search", () => {
  it("returns all items when query is omitted", () => {
    expect(search(ITEMS)).toHaveLength(3);
  });

  it("matches case-insensitively against title, summary, and tags", () => {
    expect(search(ITEMS, "OCCUPANCY").map((i) => i.id)).toEqual(["rent_roll"]);
    expect(search(ITEMS, "aging").map((i) => i.id)).toEqual(["delinquency"]);
    expect(search(ITEMS, "maintenance").map((i) => i.id)).toEqual(["work_orders"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(search(ITEMS, "nonexistent")).toEqual([]);
  });
});

describe("describe", () => {
  it("returns the item with a matching id", () => {
    expect(describeItem(ITEMS, "delinquency")?.title).toBe("Delinquency");
  });

  it("returns undefined for an unknown id", () => {
    expect(describeItem(ITEMS, "nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/catalog/registry.test.ts`
Expected: FAIL — `Cannot find module './registry'`

- [ ] **Step 3: Implement**

```ts
// src/catalog/types.ts
// ABOUTME: Shared descriptor shape for both the Reports and Database API catalogs.
export interface Descriptor {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
}
```

```ts
// src/catalog/registry.ts
// ABOUTME: Generic search/describe over any list of catalog descriptors.
// ABOUTME: Reports and Database API each bring their own execution logic on top of this.
import type { Descriptor } from "./types";

export function search<T extends Descriptor>(items: T[], query?: string): T[] {
  if (!query) return items;
  const needle = query.toLowerCase();
  return items.filter((item) => {
    const haystack = [item.id, item.title, item.summary, ...(item.tags ?? [])].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

export function describe<T extends Descriptor>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/catalog/registry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: shared catalog search/describe registry"
```

---

## Task 4: Database API catalog generation

**Files:**
- Create: `src/database/catalogGen.ts`
- Create: `scripts/generate-database-catalog.ts`
- Test: `src/database/catalogGen.test.ts`
- Generated (run manually, then commit): `src/database/operations.generated.ts`

**Interfaces:**
- Produces: `RawOperation` type, `extractReDocState(html)`, `extractOperations(state)` — consumed by Task 5. `operations.generated.ts` exports `DATABASE_OPERATIONS: RawOperation[]`, consumed by Tasks 5, 7, 8.

- [ ] **Step 1: Write the failing tests against a synthetic fixture**

```ts
// src/database/catalogGen.test.ts
// ABOUTME: Tests OpenAPI extraction against a small synthetic fixture, not the real 3.9MB export.
import { describe, it, expect } from "vitest";
import { extractReDocState, extractOperations } from "./catalogGen";

const FIXTURE_HTML = `
<html><body><script>
      const __redoc_state = {"spec":{"data":{"openapi":"3.0.0","paths":{
        "/tenants": {
          "get": {"operationId":"getTenants","summary":"List All Tenants","tags":["Tenants"]}
        },
        "/tenants/{tenantId}": {
          "patch": {"operationId":"updateTenant","summary":"Update Tenant","tags":["Tenants"]}
        },
        "/tenants/bulk": {
          "post": {"operationId":"bulkCreateTenants","summary":"Bulk Create Tenants","tags":["Tenants"]}
        },
        "/inspections/{InspectionId}": {
          "delete": {"operationId":"deleteInspection","summary":"Delete Inspection","tags":["Inspections"]}
        }
      }}}};
      Redoc.hydrate(__redoc_state, container);
</script></body></html>
`;

describe("extractReDocState", () => {
  it("parses the balanced JSON object out of the script tag", () => {
    const state = extractReDocState(FIXTURE_HTML);
    expect(state.spec.data.openapi).toBe("3.0.0");
    expect(Object.keys(state.spec.data.paths)).toHaveLength(4);
  });

  it("throws when the marker is not found", () => {
    expect(() => extractReDocState("<html></html>")).toThrow();
  });
});

describe("extractOperations", () => {
  it("flattens paths x methods into one operation per row", () => {
    const state = extractReDocState(FIXTURE_HTML);
    const ops = extractOperations(state);
    expect(ops).toHaveLength(4);
    expect(ops).toContainEqual({
      method: "GET",
      path: "/tenants",
      operationId: "getTenants",
      summary: "List All Tenants",
      tag: "Tenants",
    });
    expect(ops).toContainEqual({
      method: "DELETE",
      path: "/inspections/{InspectionId}",
      operationId: "deleteInspection",
      summary: "Delete Inspection",
      tag: "Inspections",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/database/catalogGen.test.ts`
Expected: FAIL — `Cannot find module './catalogGen'`

- [ ] **Step 3: Implement `src/database/catalogGen.ts`**

```ts
// ABOUTME: Extracts AppFolio's embedded OpenAPI spec from its Redocly HTML doc export.
// ABOUTME: Pure functions, tested against a small fixture — the real export is 3.9MB and lives outside the repo.
export interface RawOperation {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  tag: string;
}

const MARKER = "const __redoc_state = ";
const METHODS = ["get", "post", "patch", "put", "delete"];

export function extractReDocState(html: string): any {
  const startMarkerIdx = html.indexOf(MARKER);
  if (startMarkerIdx === -1) throw new Error("__redoc_state marker not found in HTML");
  const jsonStart = startMarkerIdx + MARKER.length;

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Could not find balanced end of __redoc_state JSON object");

  return JSON.parse(html.slice(jsonStart, end));
}

export function extractOperations(state: any): RawOperation[] {
  const paths = state.spec.data.paths as Record<string, Record<string, any>>;
  const ops: RawOperation[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of METHODS) {
      const op = methods[method];
      if (!op) continue;
      ops.push({
        method: method.toUpperCase(),
        path,
        operationId: op.operationId ?? "",
        summary: op.summary ?? op.description ?? "",
        tag: (op.tags && op.tags[0]) ?? "Untagged",
      });
    }
  }
  return ops;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/database/catalogGen.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the CLI generation script**

```ts
// scripts/generate-database-catalog.ts
// ABOUTME: One-time/manual CLI: reads AppFolio's Redocly HTML export and writes the committed
// ABOUTME: operations.generated.ts data file. Run whenever AppFolio's API doc export changes.
import { readFileSync, writeFileSync } from "node:fs";
import { extractReDocState, extractOperations } from "../src/database/catalogGen";

const htmlPath = process.argv[2];
const outPath = process.argv[3] ?? "src/database/operations.generated.ts";
if (!htmlPath) {
  console.error("Usage: tsx scripts/generate-database-catalog.ts <path-to-html-export> [out-path]");
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const state = extractReDocState(html);
const ops = extractOperations(state);

const header = `// ABOUTME: Generated by scripts/generate-database-catalog.ts from AppFolio's OpenAPI HTML export.\n// ABOUTME: Do not hand-edit — re-run the script against a fresh export instead.\nimport type { RawOperation } from "./catalogGen";\n\nexport const DATABASE_OPERATIONS: RawOperation[] = `;
writeFileSync(outPath, header + JSON.stringify(ops, null, 2) + ";\n");
console.log(`Wrote ${ops.length} operations to ${outPath}`);
```

- [ ] **Step 6: Run the generator against the real export and commit the output**

Run: `npm run generate:catalog ~/Downloads/database_api_March_1_2026.html`
Expected: `Wrote 151 operations to src/database/operations.generated.ts`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: AppFolio OpenAPI extraction and generated operation catalog"
```

---

## Task 5: Role-scope classification

**Files:**
- Create: `src/database/roleScope.ts`
- Test: `src/database/roleScope.test.ts`

**Interfaces:**
- Consumes: `RawOperation` (Task 4), `Role` (Task 1).
- Produces: `ScopedOperation`, `OWNER_WRITE_OPERATION_IDS`, `classifyOperation(op)`, `scopeOperations(ops)` — consumed by Tasks 7 and 8.

- [ ] **Step 1: Write the failing tests**

```ts
// src/database/roleScope.test.ts
// ABOUTME: Tests role-scope classification against both the real generated catalog and
// ABOUTME: specific known operations, to lock in the counts from the design spec.
import { describe, it, expect } from "vitest";
import { classifyOperation, scopeOperations, OWNER_WRITE_OPERATION_IDS } from "./roleScope";
import { DATABASE_OPERATIONS } from "./operations.generated";
import type { RawOperation } from "./catalogGen";

describe("classifyOperation", () => {
  it("classifies GET as READ, discoverable and executable by both roles", () => {
    const op: RawOperation = { method: "GET", path: "/tenants", operationId: "getTenants", summary: "", tag: "Tenants" };
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("READ");
    expect(scoped.executableBy).toEqual(["owner", "admin"]);
    expect(scoped.discoverableBy).toEqual(["owner", "admin"]);
  });

  it("classifies DELETE as DESTRUCTIVE, hidden from owner entirely", () => {
    const op: RawOperation = {
      method: "DELETE",
      path: "/units/{UnitId}/photos/{PhotoId}",
      operationId: "deleteUnitPhoto",
      summary: "",
      tag: "Units",
    };
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("DESTRUCTIVE");
    expect(scoped.executableBy).toEqual(["admin"]);
    expect(scoped.discoverableBy).toEqual(["admin"]);
  });

  it("classifies bulk operations as DESTRUCTIVE even when the method is POST", () => {
    const op: RawOperation = { method: "POST", path: "/tenants/bulk", operationId: "bulkCreateTenants", summary: "", tag: "Tenants" };
    expect(classifyOperation(op).class).toBe("DESTRUCTIVE");
  });

  it("classifies an owner-allowlisted write as WRITE, executable by both roles", () => {
    const op: RawOperation = {
      method: "POST",
      path: "/work_orders/{WorkOrderId}/notes",
      operationId: "createWorkOrderNote",
      summary: "",
      tag: "Work Orders",
    };
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("WRITE");
    expect(scoped.executableBy).toEqual(["owner", "admin"]);
  });

  it("classifies a non-allowlisted write as admin-only to execute but discoverable by owner", () => {
    const op: RawOperation = { method: "PATCH", path: "/bills/{billId}", operationId: "updateBill", summary: "", tag: "Bills" };
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("WRITE");
    expect(scoped.executableBy).toEqual(["admin"]);
    expect(scoped.discoverableBy).toEqual(["owner", "admin"]);
  });

  it("never gives owner the whole-record Tenant PATCH, but does give full Vendor writes", () => {
    expect(OWNER_WRITE_OPERATION_IDS.has("updateTenant")).toBe(false);
    expect(OWNER_WRITE_OPERATION_IDS.has("updateVendor")).toBe(true);
  });
});

describe("scopeOperations against the real generated catalog", () => {
  it("matches the counts locked in by the design spec", () => {
    const scoped = scopeOperations(DATABASE_OPERATIONS);
    expect(scoped).toHaveLength(151);
    expect(scoped.filter((o) => o.class === "READ")).toHaveLength(58);
    expect(scoped.filter((o) => o.executableBy.includes("owner"))).toHaveLength(77);
    expect(scoped.filter((o) => o.class === "DESTRUCTIVE")).toHaveLength(28);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/database/roleScope.test.ts`
Expected: FAIL — `Cannot find module './roleScope'`

- [ ] **Step 3: Implement `src/database/roleScope.ts`**

```ts
// ABOUTME: Classifies every Database API operation by role scope — who can execute it, and
// ABOUTME: who can discover it exists, per the design spec's owner/admin allowlist.
import type { RawOperation } from "./catalogGen";
import type { Role } from "../config";

export type OperationClass = "READ" | "WRITE" | "DESTRUCTIVE";

export interface ScopedOperation extends RawOperation {
  class: OperationClass;
  executableBy: Role[];
  discoverableBy: Role[];
}

// Curated allowlist for `owner` (Justin) — narrow, additive, scoped to running unit turns
// and work orders. Notes/attachments/photos are separate sub-resources from the parent
// record's own PATCH, so owner never gets updateTenant (whole-record write); updateVendor
// is included in full per an explicit decision to give owner full vendor writes, not just notes.
export const OWNER_WRITE_OPERATION_IDS = new Set([
  // Work orders
  "createWorkOrder",
  "updateWorkOrder",
  "createWorkOrderNote",
  "updateWorkOrderNote",
  "createWorkOrderAttachment",
  // Tenants (notes only)
  "createTenantNote",
  "updateTenantNote",
  // Vendors (full record writes)
  "createVendor",
  "updateVendor",
  "createVendorNote",
  "updateVendorNote",
  // Units (notes, attachments, photos — not pricing, not photo deletion)
  "createUnitNote",
  "updateUnitNote",
  "createUnitAttachment",
  "createUnitPhoto",
  "updateUnitPhoto",
  // Inspections (unit-turn workflow)
  "createInspection",
  "updateInspection",
  "createInspectionAttachment",
]);

const BOTH_ROLES: Role[] = ["owner", "admin"];
const ADMIN_ONLY: Role[] = ["admin"];

export function classifyOperation(op: RawOperation): ScopedOperation {
  if (op.method === "DELETE") {
    return { ...op, class: "DESTRUCTIVE", executableBy: ADMIN_ONLY, discoverableBy: ADMIN_ONLY };
  }
  if (op.method === "GET") {
    return { ...op, class: "READ", executableBy: BOTH_ROLES, discoverableBy: BOTH_ROLES };
  }

  const isBulk = /bulk/i.test(op.operationId) || /bulk/i.test(op.path);
  if (isBulk) {
    return { ...op, class: "DESTRUCTIVE", executableBy: ADMIN_ONLY, discoverableBy: ADMIN_ONLY };
  }

  const executableBy = OWNER_WRITE_OPERATION_IDS.has(op.operationId) ? BOTH_ROLES : ADMIN_ONLY;
  return { ...op, class: "WRITE", executableBy, discoverableBy: BOTH_ROLES };
}

export function scopeOperations(ops: RawOperation[]): ScopedOperation[] {
  return ops.map(classifyOperation);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/database/roleScope.test.ts`
Expected: PASS (8 tests). If the count assertions fail, diff against `docs/reference/database-api-role-scopes.md` — that file is the source of truth for expected counts, generated the same way.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: owner/admin role-scope classification for the database catalog"
```

---

## Task 6: Confirm-token module

**Files:**
- Create: `src/database/confirmToken.ts`
- Test: `src/database/confirmToken.test.ts`

**Interfaces:**
- Produces: `PendingWrite`, `createConfirmToken(write, secret)`, `verifyConfirmToken(token, secret)` — consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// src/database/confirmToken.test.ts
// ABOUTME: Tests the stateless, signed confirm token — no server-side session, by design,
// ABOUTME: since Vercel serverless functions share no memory across invocations.
import { describe, it, expect, vi } from "vitest";
import { createConfirmToken, verifyConfirmToken } from "./confirmToken";

const SECRET = "a".repeat(32);
const WRITE = { method: "PATCH", url: "https://api.appfolio.com/api/v0/work_orders/123", body: { Status: "Completed" } };

describe("confirm token", () => {
  it("round-trips a valid token back to the original write", () => {
    const token = createConfirmToken(WRITE, SECRET);
    expect(verifyConfirmToken(token, SECRET)).toEqual(WRITE);
  });

  it("rejects a token verified with the wrong secret", () => {
    const token = createConfirmToken(WRITE, SECRET);
    expect(verifyConfirmToken(token, "b".repeat(32))).toBeUndefined();
  });

  it("rejects a malformed token", () => {
    expect(verifyConfirmToken("not-a-real-token", SECRET)).toBeUndefined();
  });

  it("rejects a tampered payload even with a structurally valid token", () => {
    const token = createConfirmToken(WRITE, SECRET);
    const [payload] = token.split(".");
    const tampered = payload + "x." + token.split(".")[1];
    expect(verifyConfirmToken(tampered, SECRET)).toBeUndefined();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createConfirmToken(WRITE, SECRET);
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z")); // 16 minutes later, past the 15-minute TTL
    expect(verifyConfirmToken(token, SECRET)).toBeUndefined();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/database/confirmToken.test.ts`
Expected: FAIL — `Cannot find module './confirmToken'`

- [ ] **Step 3: Implement `src/database/confirmToken.ts`**

```ts
// ABOUTME: Stateless, HMAC-signed confirm tokens binding a write preview to its exact execution.
// ABOUTME: No server-side session — the token itself carries the signed request, since Vercel
// ABOUTME: serverless functions share no memory between the preview call and the confirm call.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PendingWrite {
  method: string;
  url: string;
  body: unknown;
}

interface TokenPayload extends PendingWrite {
  issuedAt: number;
}

const TOKEN_TTL_MS = 15 * 60 * 1000;

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function createConfirmToken(write: PendingWrite, secret: string): string {
  const payload: TokenPayload = { ...write, issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifyConfirmToken(token: string, secret: string): PendingWrite | undefined {
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const [payloadB64, signature] = parts;

  const expected = sign(payloadB64, secret);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return undefined;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return undefined;

  const { issuedAt, ...write } = payload;
  return write;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/database/confirmToken.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: stateless signed confirm tokens for the write path"
```

---

## Task 7: `list_endpoints` and `describe_endpoint` tools

**Files:**
- Create: `src/database/tools.ts` (discovery portion)
- Test: `src/database/tools.test.ts` (discovery portion)

**Interfaces:**
- Consumes: `ScopedOperation`/`scopeOperations` (Task 5).
- Produces: `CallerContext`, `listEndpoints(ops, caller, opts)`, `describeEndpoint(ops, caller, operationId)` — consumed by the route handler (Task 16). Also produces `NotFoundError`, reused by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// src/database/tools.test.ts
// ABOUTME: Tests the discovery tools' role-aware filtering — destructive ops are fully
// ABOUTME: invisible to owner; ordinary admin-only writes are visible but marked uncallable.
import { describe, it, expect } from "vitest";
import { listEndpoints, describeEndpoint, NotFoundError } from "./tools";
import { scopeOperations } from "./roleScope";
import type { RawOperation } from "./catalogGen";

const RAW_OPS: RawOperation[] = [
  { method: "GET", path: "/tenants", operationId: "getTenants", summary: "List tenants", tag: "Tenants" },
  { method: "PATCH", path: "/bills/{id}", operationId: "updateBill", summary: "Update a bill", tag: "Bills" },
  { method: "DELETE", path: "/inspections/{id}", operationId: "deleteInspection", summary: "Delete inspection", tag: "Inspections" },
  {
    method: "POST",
    path: "/work_orders/{id}/notes",
    operationId: "createWorkOrderNote",
    summary: "Create work order note",
    tag: "Work Orders",
  },
];
const OPS = scopeOperations(RAW_OPS);

describe("listEndpoints", () => {
  it("shows owner everything except destructive operations", () => {
    const result = listEndpoints(OPS, { role: "owner" }, {});
    const ids = result.map((r) => r.operationId);
    expect(ids).toContain("getTenants");
    expect(ids).toContain("updateBill");
    expect(ids).toContain("createWorkOrderNote");
    expect(ids).not.toContain("deleteInspection");
  });

  it("marks admin-only writes as not callable by owner, with a reason", () => {
    const result = listEndpoints(OPS, { role: "owner" }, {});
    const bill = result.find((r) => r.operationId === "updateBill");
    expect(bill?.callable).toBe(false);
    expect(bill?.reason).toMatch(/admin/i);
  });

  it("marks owner-allowlisted writes as callable by owner", () => {
    const result = listEndpoints(OPS, { role: "owner" }, {});
    const note = result.find((r) => r.operationId === "createWorkOrderNote");
    expect(note?.callable).toBe(true);
  });

  it("shows admin everything, including destructive operations", () => {
    const result = listEndpoints(OPS, { role: "admin" }, {});
    expect(result.map((r) => r.operationId)).toContain("deleteInspection");
  });

  it("filters by search text", () => {
    const result = listEndpoints(OPS, { role: "admin" }, { search: "bill" });
    expect(result.map((r) => r.operationId)).toEqual(["updateBill"]);
  });
});

describe("describeEndpoint", () => {
  it("returns full detail for a discoverable operation", () => {
    const result = describeEndpoint(OPS, { role: "owner" }, "updateBill");
    expect(result.operationId).toBe("updateBill");
  });

  it("throws NotFoundError for a destructive operation hidden from owner", () => {
    expect(() => describeEndpoint(OPS, { role: "owner" }, "deleteInspection")).toThrow(NotFoundError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/database/tools.test.ts`
Expected: FAIL — `Cannot find module './tools'`

- [ ] **Step 3: Implement the discovery portion of `src/database/tools.ts`**

```ts
// ABOUTME: MCP tool implementations over the role-scoped Database API catalog: discovery
// ABOUTME: (list/describe) and, further down, the execute/write path (added in Task 8).
import type { Role } from "../config";
import type { ScopedOperation } from "./roleScope";
import { search, describe as describeItem } from "../catalog/registry";

export interface CallerContext {
  role: Role;
}

export class NotFoundError extends Error {}

export interface EndpointListing {
  operationId: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  callable: boolean;
  reason?: string;
}

function toListing(op: ScopedOperation, caller: CallerContext): EndpointListing {
  const callable = op.executableBy.includes(caller.role);
  return {
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    tag: op.tag,
    summary: op.summary,
    callable,
    reason: callable ? undefined : "admin-only — ask Bret to enable",
  };
}

function discoverableTo(ops: ScopedOperation[], caller: CallerContext): ScopedOperation[] {
  return ops.filter((op) => op.discoverableBy.includes(caller.role));
}

export function listEndpoints(
  ops: ScopedOperation[],
  caller: CallerContext,
  opts: { search?: string; tag?: string; method?: string }
): EndpointListing[] {
  let visible = discoverableTo(ops, caller);
  if (opts.tag) visible = visible.filter((op) => op.tag === opts.tag);
  if (opts.method) visible = visible.filter((op) => op.method === opts.method.toUpperCase());
  visible = search(
    visible.map((op) => ({ ...op, id: op.operationId, title: op.summary })),
    opts.search
  ) as unknown as ScopedOperation[];
  return visible.map((op) => toListing(op, caller));
}

export function describeEndpoint(ops: ScopedOperation[], caller: CallerContext, operationId: string): ScopedOperation {
  const visible = discoverableTo(ops, caller);
  const op = describeItem(
    visible.map((o) => ({ ...o, id: o.operationId, title: o.summary })),
    operationId
  );
  if (!op) throw new NotFoundError(`Unknown operation: ${operationId}`);
  return visible.find((o) => o.operationId === operationId)!;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/database/tools.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: role-aware list_endpoints and describe_endpoint tools"
```

---

## Task 8: `call_endpoint` and `confirm_write` (the write path)

**Files:**
- Modify: `src/database/tools.ts` (append the execute/write portion)
- Test: `src/database/tools.test.ts` (append)

**Interfaces:**
- Consumes: `AppFolioHttpClient` (Task 2), `ScopedOperation`/`CallerContext` (Tasks 5, 7), `createConfirmToken`/`verifyConfirmToken` (Task 6).
- Produces: `PermissionError`, `WritesDisabledError`, `InvalidTokenError`, `callEndpoint(deps, caller, operationId, params)`, `confirmWrite(deps, caller, token)` — consumed by the route handler (Task 16).

- [ ] **Step 1: Write the failing tests**

```ts
// Append to src/database/tools.test.ts
import { vi } from "vitest";
import { callEndpoint, confirmWrite, PermissionError, WritesDisabledError, InvalidTokenError } from "./tools";
import { verifyConfirmToken } from "./confirmToken";

const SECRET = "a".repeat(32);

function makeDeps(overrides: Partial<Parameters<typeof callEndpoint>[0]> = {}) {
  return {
    ops: OPS,
    http: { request: vi.fn().mockResolvedValue({ ok: true }) } as any,
    tokenSecret: SECRET,
    writesEnabled: true,
    destructiveEnabled: true,
    notifyAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("callEndpoint — reads", () => {
  it("executes GET operations directly without a confirm step", async () => {
    const deps = makeDeps();
    const result = await callEndpoint(deps, { role: "owner" }, "getTenants", {});
    expect(result).toEqual({ executed: true, result: { ok: true } });
    expect(deps.http.request).toHaveBeenCalledWith("GET", "/tenants", { query: undefined });
  });
});

describe("callEndpoint — writes", () => {
  it("returns a preview and confirm token instead of executing, for an allowed write", async () => {
    const deps = makeDeps();
    const result = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "Replaced the garbage disposal" },
    });
    expect(result.executed).toBe(false);
    if (result.executed) throw new Error("unreachable");
    expect(result.preview).toEqual({
      method: "POST",
      url: "/work_orders/42/notes",
      body: { Note: "Replaced the garbage disposal" },
    });
    expect(verifyConfirmToken(result.confirmToken, SECRET)).toEqual(result.preview);
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "preview", operationId: "createWorkOrderNote", caller: "owner" })
    );
  });

  it("rejects a write outside the caller's role with PermissionError", async () => {
    const deps = makeDeps();
    await expect(callEndpoint(deps, { role: "owner" }, "updateBill", { pathParams: { id: "1" } })).rejects.toThrow(
      PermissionError
    );
  });

  it("rejects a write with WritesDisabledError when writesEnabled is false", async () => {
    const deps = makeDeps({ writesEnabled: false });
    await expect(
      callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", { pathParams: { id: "42" }, body: {} })
    ).rejects.toThrow(WritesDisabledError);
  });

  it("throws PermissionError (not found) for an operation owner cannot even discover", async () => {
    const deps = makeDeps();
    await expect(callEndpoint(deps, { role: "owner" }, "deleteInspection", { pathParams: { id: "1" } })).rejects.toThrow(
      PermissionError
    );
  });
});

describe("confirmWrite", () => {
  it("executes the exact request encoded in a valid token", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "Replaced the garbage disposal" },
    });
    if (preview.executed) throw new Error("unreachable");

    const result = await confirmWrite(deps, { role: "owner" }, preview.confirmToken);

    expect(result).toEqual({ ok: true });
    expect(deps.http.request).toHaveBeenCalledWith("POST", "/work_orders/42/notes", {
      body: { Note: "Replaced the garbage disposal" },
    });
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "confirmed", caller: "owner", outcome: "success" })
    );
  });

  it("rejects an invalid token with InvalidTokenError", async () => {
    const deps = makeDeps();
    await expect(confirmWrite(deps, { role: "owner" }, "garbage")).rejects.toThrow(InvalidTokenError);
  });

  it("logs a failure outcome and rethrows when the underlying request fails", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "x" },
    });
    if (preview.executed) throw new Error("unreachable");
    deps.http.request = vi.fn().mockRejectedValue(new Error("AppFolio 500"));

    await expect(confirmWrite(deps, { role: "owner" }, preview.confirmToken)).rejects.toThrow("AppFolio 500");
    expect(deps.notifyAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "confirmed", outcome: "failure" }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/database/tools.test.ts`
Expected: FAIL — `callEndpoint is not exported`

- [ ] **Step 3: Append the write path to `src/database/tools.ts`**

```ts
// Append to src/database/tools.ts
import type { AppFolioHttpClient } from "../http";
import { createConfirmToken, verifyConfirmToken, type PendingWrite } from "./confirmToken";

export class PermissionError extends Error {}
export class WritesDisabledError extends Error {}
export class InvalidTokenError extends Error {}

export interface AuditEvent {
  type: "preview" | "confirmed";
  operationId?: string;
  caller: Role;
  url: string;
  outcome?: "success" | "failure";
}

export interface CallEndpointDeps {
  ops: ScopedOperation[];
  http: Pick<AppFolioHttpClient, "request">;
  tokenSecret: string;
  writesEnabled: boolean;
  destructiveEnabled: boolean;
  notifyAudit: (event: AuditEvent) => Promise<void>;
}

export type CallEndpointResult =
  | { executed: true; result: unknown }
  | { executed: false; preview: PendingWrite; confirmToken: string };

function resolvePath(path: string, pathParams: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_match, name) => {
    const value = pathParams[name];
    if (!value) throw new PermissionError(`Missing path param: ${name}`);
    return value;
  });
}

function findDiscoverable(ops: ScopedOperation[], caller: CallerContext, operationId: string): ScopedOperation {
  const op = ops.find((o) => o.operationId === operationId && o.discoverableBy.includes(caller.role));
  if (!op) throw new PermissionError(`Unknown operation: ${operationId}`);
  return op;
}

export async function callEndpoint(
  deps: CallEndpointDeps,
  caller: CallerContext,
  operationId: string,
  params: { pathParams?: Record<string, string>; query?: Record<string, string>; body?: unknown }
): Promise<CallEndpointResult> {
  const op = findDiscoverable(deps.ops, caller, operationId);
  const url = resolvePath(op.path, params.pathParams);

  if (op.class === "READ") {
    const result = await deps.http.request(op.method, url, { query: params.query });
    return { executed: true, result };
  }

  if (!op.executableBy.includes(caller.role)) {
    throw new PermissionError(`${operationId} requires admin role — ask Bret to enable it`);
  }
  if (op.class === "DESTRUCTIVE" && !deps.destructiveEnabled) {
    throw new WritesDisabledError(`${operationId} is destructive and destructive writes are disabled`);
  }
  if (!deps.writesEnabled) {
    throw new WritesDisabledError(`${operationId} is a write and writes are disabled`);
  }

  const write: PendingWrite = { method: op.method, url, body: params.body };
  const confirmToken = createConfirmToken(write, deps.tokenSecret);
  await deps.notifyAudit({ type: "preview", operationId, caller: caller.role, url });
  return { executed: false, preview: write, confirmToken };
}

export async function confirmWrite(deps: CallEndpointDeps, caller: CallerContext, token: string): Promise<unknown> {
  const write = verifyConfirmToken(token, deps.tokenSecret);
  if (!write) throw new InvalidTokenError("Confirm token is invalid or expired");

  try {
    const result = await deps.http.request(write.method, write.url, { body: write.body });
    await deps.notifyAudit({ type: "confirmed", caller: caller.role, url: write.url, outcome: "success" });
    return result;
  } catch (err) {
    await deps.notifyAudit({ type: "confirmed", caller: caller.role, url: write.url, outcome: "failure" });
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/database/tools.test.ts`
Expected: PASS (14 tests total)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: call_endpoint preview + confirm_write execution path"
```

---

## Task 9: Audit logging (Slack)

**Files:**
- Create: `src/audit.ts`
- Test: `src/audit.test.ts`

**Interfaces:**
- Produces: `createAuditNotifier(webhookUrl, fetchImpl?)` returning a `notifyAudit(event)` function matching the shape Task 8's `CallEndpointDeps.notifyAudit` expects.

- [ ] **Step 1: Write the failing tests**

```ts
// src/audit.test.ts
// ABOUTME: Tests the Slack audit notifier — metadata only, never payload field values.
import { describe, it, expect, vi } from "vitest";
import { createAuditNotifier, formatAuditMessage } from "./audit";

describe("formatAuditMessage", () => {
  it("formats a preview event", () => {
    const msg = formatAuditMessage({ type: "preview", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42" });
    expect(msg).toContain("owner");
    expect(msg).toContain("updateWorkOrder");
    expect(msg).toContain("/work_orders/42");
  });

  it("formats a confirmed success event", () => {
    const msg = formatAuditMessage({ type: "confirmed", caller: "admin", url: "/bills/9", outcome: "success" });
    expect(msg).toContain("admin");
    expect(msg).toContain("success");
  });

  it("formats a confirmed failure event", () => {
    const msg = formatAuditMessage({ type: "confirmed", caller: "admin", url: "/bills/9", outcome: "failure" });
    expect(msg).toContain("failure");
  });
});

describe("createAuditNotifier", () => {
  it("posts the formatted message to the webhook URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok"));
    const notify = createAuditNotifier("https://hooks.slack.com/services/T/B/X", fetchImpl);

    await notify({ type: "preview", operationId: "updateWorkOrder", caller: "owner", url: "/work_orders/42" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T/B/X",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("updateWorkOrder");
  });

  it("is a no-op when no webhook URL is configured", async () => {
    const fetchImpl = vi.fn();
    const notify = createAuditNotifier(undefined, fetchImpl);

    await notify({ type: "preview", operationId: "x", caller: "owner", url: "/x" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/audit.test.ts`
Expected: FAIL — `Cannot find module './audit'`

- [ ] **Step 3: Implement `src/audit.ts`**

```ts
// ABOUTME: Posts write-event notifications to #appfolio-mcp-audit via Slack incoming webhook.
// ABOUTME: Metadata only — operation, who, when, outcome — never the payload's field values.
import type { AuditEvent } from "./database/tools";

export function formatAuditMessage(event: AuditEvent): string {
  const timestamp = new Date().toISOString();
  if (event.type === "preview") {
    return `:eyes: [${timestamp}] *${event.caller}* previewed \`${event.operationId}\` → \`${event.url}\``;
  }
  const icon = event.outcome === "success" ? ":white_check_mark:" : ":x:";
  return `${icon} [${timestamp}] *${event.caller}* confirmed a write → \`${event.url}\` (${event.outcome})`;
}

export function createAuditNotifier(webhookUrl: string | undefined, fetchImpl: typeof fetch = fetch) {
  return async function notifyAudit(event: AuditEvent): Promise<void> {
    if (!webhookUrl) return;
    await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: formatAuditMessage(event) }),
    });
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audit.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Slack audit notifier for write events"
```

---

## Remaining tasks (10–16)

The plan continues with the Reports module, the four composites, WorkOS auth wiring, and final route assembly. Given the length of Tasks 1–9, those are written up as follow-on plan documents to keep each file reviewable — see `docs/superpowers/plans/2026-08-13-appfolio-mcp-reports-and-composites.md` (Tasks 10–14: Reports catalog + tools, and the four composites) and `docs/superpowers/plans/2026-08-13-appfolio-mcp-auth-and-deploy.md` (Tasks 15–16: WorkOS auth wiring, route assembly and Vercel deploy).
