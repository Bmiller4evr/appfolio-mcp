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

## Task 10: Reports module — catalog, discovery, and execution

**Files:**
- Create: `src/reports/operations.data.ts`, `src/reports/tools.ts`
- Test: `src/reports/tools.test.ts`

**Interfaces:**
- Consumes: `search`/`describe` (Task 3), `AppFolioHttpClient` (Task 2 — a separate instance, base URL `https://{database}.appfolio.com/api/v2`, constructed in Task 16).
- Produces: `listReports(query?)`, `describeReport(id)`, `runReport(http, id, opts)`, `ReportDescriptor` — consumed by the route handler (Task 16) and by Tasks 11–14's composites.

**Honesty note carried from the design spec:** only `vendor_directory`'s V2 column/filter names are independently verified (reused with attribution from CryptoCultCurt's ISC-licensed, live-tested implementation). AppFolio's V1→V2 migration renamed columns (PascalCase → snake_case, and some fields changed outright), so this plan does **not** guess at `rent_roll`/`delinquency`/`work_order`'s V2 names — `runReport` refuses to execute an unverified report rather than silently return wrong data. Tasks 11–14 each open with the real verification step for the report they depend on.

- [ ] **Step 1: Write the failing tests**

```ts
// src/reports/tools.test.ts
// ABOUTME: Tests the reports catalog and execution tools — verified vs unverified reports,
// ABOUTME: column-scoped queries, truncation and pagination signal.
import { describe, it, expect, vi } from "vitest";
import { listReports, describeReport, runReport, UnverifiedReportError, NotFoundError } from "./tools";

describe("listReports", () => {
  it("lists all reports, flagging which are verified", () => {
    const results = listReports();
    expect(results.find((r) => r.id === "vendor_directory")?.verified).toBe(true);
    expect(results.find((r) => r.id === "rent_roll")?.verified).toBe(false);
  });

  it("filters by search text", () => {
    expect(listReports("vendor").map((r) => r.id)).toEqual(["vendor_directory"]);
  });
});

describe("describeReport", () => {
  it("returns full column/filter detail for a verified report", () => {
    const report = describeReport("vendor_directory");
    expect(report.columns.map((c) => c.name)).toContain("liability_ins_expires");
  });

  it("throws NotFoundError for an unknown report", () => {
    expect(() => describeReport("nope")).toThrow(NotFoundError);
  });
});

describe("runReport", () => {
  it("executes a verified report and returns rows", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [{ vendor_type: "Plumbing" }] }) };
    const result = await runReport(http, "vendor_directory", { filters: { liability_expiration_to: "2026-09-13" } });
    expect(result).toEqual({ rows: [{ vendor_type: "Plumbing" }], count: 1, truncated: false, nextPageUrl: undefined });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/vendor_directory", {
      body: { filters: { liability_expiration_to: "2026-09-13" } },
    });
  });

  it("truncates to maxRows and reports truncation", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [{ id: 1 }, { id: 2 }, { id: 3 }] }) };
    const result = await runReport(http, "vendor_directory", { maxRows: 2 });
    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("refuses to run an unverified report rather than guess at its columns", async () => {
    const http = { request: vi.fn() };
    await expect(runReport(http, "rent_roll")).rejects.toThrow(UnverifiedReportError);
    expect(http.request).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/reports/tools.test.ts`
Expected: FAIL — `Cannot find module './tools'`

- [ ] **Step 3: Implement `src/reports/operations.data.ts`**

```ts
// ABOUTME: AppFolio Reports API (V2) catalog. Only vendor_directory's columns/filters are
// ABOUTME: independently verified — everything else is listed by id pending verification.
export interface ReportColumn {
  name: string;
  type: string;
}

export interface ReportDescriptor {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  verified: boolean;
  source?: string;
  columns: ReportColumn[];
  filters: ReportColumn[];
}

// Attribution: vendor_directory's V2 column/filter names below are reused, with attribution
// under its ISC license, from https://github.com/CryptoCultCurt/appfolio-mcp-server — the
// only prior implementation verified against AppFolio's live V2 Reports API at design time.
export const REPORTS: ReportDescriptor[] = [
  {
    id: "vendor_directory",
    title: "Vendor Directory",
    summary: "All vendors with license/insurance expirations and compliance flags.",
    tags: ["vendors", "compliance"],
    verified: true,
    source: "cryptocultcurt-v2 (ISC, attributed)",
    columns: [
      { name: "vendor_type", type: "string" },
      { name: "portal_activated", type: "boolean" },
      { name: "created_by", type: "string" },
      { name: "workers_comp_expires", type: "date" },
      { name: "liability_ins_expires", type: "date" },
      { name: "epa_cert_expires", type: "date" },
      { name: "state_lic_expires", type: "date" },
      { name: "do_not_use_for_work_order", type: "boolean" },
    ],
    filters: [
      { name: "liability_expiration_to", type: "date" },
      { name: "workers_comp_expiration_to", type: "date" },
      { name: "epa_expiration_to", type: "date" },
      { name: "auto_insurance_expiration_to", type: "date" },
      { name: "state_license_expiration_to", type: "date" },
      { name: "contract_expiration_to", type: "date" },
    ],
  },
  // Known by id (V1 CSV export + AppFolio's Reports API), V2 columns NOT yet verified.
  // Tasks 11-13 each verify and fill in the report they depend on before using it.
  { id: "rent_roll", title: "Rent Roll", summary: "Occupancy and rent by unit.", tags: ["occupancy"], verified: false, columns: [], filters: [] },
  { id: "delinquency", title: "Delinquency", summary: "Aging balances by tenant.", tags: ["financial"], verified: false, columns: [], filters: [] },
  { id: "work_order", title: "Work Orders", summary: "Open and closed maintenance tickets.", tags: ["maintenance"], verified: false, columns: [], filters: [] },
];
```

- [ ] **Step 4: Implement `src/reports/tools.ts`**

```ts
// ABOUTME: MCP tool implementations over the Reports API catalog: list/describe (Task 3's
// ABOUTME: generic registry) and run (POST to AppFolio's V2 endpoint), gated on verification.
import type { AppFolioHttpClient } from "../http";
import { search, describe as describeItem } from "../catalog/registry";
import { REPORTS, type ReportDescriptor } from "./operations.data";

export class NotFoundError extends Error {}
export class UnverifiedReportError extends Error {}

export function listReports(query?: string) {
  return search(REPORTS, query).map((r) => ({ id: r.id, title: r.title, summary: r.summary, verified: r.verified }));
}

export function describeReport(reportId: string): ReportDescriptor {
  const report = describeItem(REPORTS, reportId);
  if (!report) throw new NotFoundError(`Unknown report: ${reportId}`);
  return report;
}

export interface RunReportResult {
  rows: Record<string, unknown>[];
  count: number;
  truncated: boolean;
  nextPageUrl?: string;
}

export async function runReport(
  http: Pick<AppFolioHttpClient, "request">,
  reportId: string,
  opts: { filters?: Record<string, unknown>; columns?: string[]; maxRows?: number } = {}
): Promise<RunReportResult> {
  const report = describeReport(reportId);
  if (!report.verified) {
    throw new UnverifiedReportError(
      `${reportId}'s V2 columns are unverified — confirm against Manage API Settings → Reports API Documentation before running it`
    );
  }

  const maxRows = opts.maxRows ?? 500;
  const body: Record<string, unknown> = { filters: opts.filters ?? {} };
  if (opts.columns) body.columns = opts.columns;

  const response = (await http.request("POST", `/reports/${reportId}`, { body })) as {
    results: Record<string, unknown>[];
    next_page_url?: string;
  };
  const rows = response.results.slice(0, maxRows);
  return {
    rows,
    count: rows.length,
    truncated: response.results.length > maxRows,
    nextPageUrl: response.next_page_url,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/reports/tools.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Reports API catalog, discovery, and execution (verification-gated)"
```

---

## Task 11: Composite — `vendor_compliance`

The only composite buildable end-to-end right now — `vendor_directory` is the one verified report, and it joins against the Database API's `getWorkOrders` (already built in Task 8) for property attribution, exactly the case the design spec calls out: `vendor_directory` has no property column, so answering "which vendors have insurance expiring soon, grouped by property" requires this join.

**Files:**
- Create: `src/composites/vendorCompliance.ts`
- Test: `src/composites/vendorCompliance.test.ts`
- Create: `docs/composites/vendor-compliance.md`

**Interfaces:**
- Consumes: `runReport` (Task 10), `callEndpoint` (Task 8, called internally for the `getWorkOrders` read — composites reuse the same role-scoped path, never a private route around it).
- Produces: `vendorCompliance(deps, caller, opts)` — consumed by the route handler (Task 16).

- [ ] **Step 1: Write the failing tests**

```ts
// src/composites/vendorCompliance.test.ts
// ABOUTME: Tests the vendor_compliance composite's join: vendor_directory (no property column)
// ABOUTME: attributed to properties via the Database API's work_orders.
import { describe, it, expect, vi } from "vitest";
import { vendorCompliance } from "./vendorCompliance";

function makeDeps() {
  return {
    reportsHttp: {
      request: vi.fn().mockResolvedValue({
        results: [
          { id: "v1", vendor_type: "Plumbing", liability_ins_expires: "2026-09-01", workers_comp_expires: "2027-01-01" },
          { id: "v2", vendor_type: "Electrical", liability_ins_expires: "2027-06-01", workers_comp_expires: "2027-06-01" },
        ],
      }),
    },
    callEndpoint: vi.fn().mockResolvedValue({
      executed: true,
      result: [
        { vendor_id: "v1", PropertyId: "p100" },
        { vendor_id: "v1", PropertyId: "p200" },
      ],
    }),
    // Opaque to this unit test — vendorCompliance just forwards it to callEndpoint, which is
    // itself mocked above. Route assembly (Task 16) provides the real CallEndpointDeps.
    callEndpointDeps: {} as any,
  };
}

describe("vendorCompliance", () => {
  it("filters vendors whose insurance expires within the window and attributes them to properties", async () => {
    const deps = makeDeps();
    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0]).toMatchObject({ id: "v1", vendorType: "Plumbing", properties: ["p100", "p200"] });
  });

  it("calls the report with the expiration filter pushed server-side", async () => {
    const deps = makeDeps();
    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });
    expect(deps.reportsHttp.request).toHaveBeenCalledWith("POST", "/reports/vendor_directory", {
      body: { filters: { liability_expiration_to: "2026-09-12" } },
    });
  });

  it("goes through the role-scoped callEndpoint for the work_orders join, not a private route", async () => {
    const deps = makeDeps();
    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });
    expect(deps.callEndpoint).toHaveBeenCalledWith(expect.anything(), { role: "owner" }, "getWorkOrders", {});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composites/vendorCompliance.test.ts`
Expected: FAIL — `Cannot find module './vendorCompliance'`

- [ ] **Step 3: Implement**

```ts
// src/composites/vendorCompliance.ts
// ABOUTME: Which vendors have insurance/license expiring soon, grouped by the properties they
// ABOUTME: actually work at — vendor_directory has no property column, so this joins work_orders.
import type { AppFolioHttpClient } from "../http";
import type { CallerContext, CallEndpointDeps, CallEndpointResult } from "../database/tools";
import { runReport } from "../reports/tools";

export interface VendorComplianceDeps {
  reportsHttp: Pick<AppFolioHttpClient, "request">;
  callEndpoint: (
    deps: CallEndpointDeps,
    caller: CallerContext,
    operationId: string,
    params: Record<string, unknown>
  ) => Promise<CallEndpointResult>;
  callEndpointDeps?: CallEndpointDeps;
}

export interface VendorComplianceEntry {
  id: string;
  vendorType: string;
  liabilityInsExpires: string;
  workersCompExpires: string;
  properties: string[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function vendorCompliance(
  deps: VendorComplianceDeps,
  caller: CallerContext,
  opts: { withinDays: number; asOf: string }
): Promise<{ vendors: VendorComplianceEntry[] }> {
  const cutoff = addDays(opts.asOf, opts.withinDays);

  const report = await runReport(deps.reportsHttp, "vendor_directory", {
    filters: { liability_expiration_to: cutoff },
  });

  const workOrdersResult = await deps.callEndpoint(deps.callEndpointDeps!, caller, "getWorkOrders", {});
  const workOrders = workOrdersResult.executed ? (workOrdersResult.result as { vendor_id: string; PropertyId: string }[]) : [];

  const propertiesByVendor = new Map<string, Set<string>>();
  for (const wo of workOrders) {
    if (!propertiesByVendor.has(wo.vendor_id)) propertiesByVendor.set(wo.vendor_id, new Set());
    propertiesByVendor.get(wo.vendor_id)!.add(wo.PropertyId);
  }

  const vendors = report.rows.map((row: any) => ({
    id: row.id,
    vendorType: row.vendor_type,
    liabilityInsExpires: row.liability_ins_expires,
    workersCompExpires: row.workers_comp_expires,
    properties: Array.from(propertiesByVendor.get(row.id) ?? []),
  }));

  return { vendors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composites/vendorCompliance.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the composite's doc contract**

```markdown
// docs/composites/vendor-compliance.md
# vendor_compliance

**Question it answers:** which vendors have insurance or licenses expiring within N days, grouped by the properties they actually work at.

**Reports/endpoints called:**
- `vendor_directory` (Reports API V2), filtered server-side on `liability_expiration_to`.
- `getWorkOrders` (Database API), read through the same role-scoped `callEndpoint` path every other tool uses — no private route.

**Join logic:** `vendor_directory` has no property column. Property attribution comes entirely from `work_orders.vendor_id` → `work_orders.PropertyId`, deduplicated per vendor. A vendor who has never had a work order shows an empty `properties` array — that's not a bug, it means no property attribution exists yet, not that the vendor is uncompliant everywhere.

**Assumptions:** only `liability_ins_expires` drives the filter today (via `liability_expiration_to`); `workers_comp_expires` and the other four expiration columns are returned but not separately filtered. Expand the filter set if you need "any of these expiring soon" rather than "liability specifically."
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: vendor_compliance composite (vendor_directory joined to work_orders)"
```

---

## Task 12: Composite — `rent_roll_summary`

**This task starts with real verification, not code.** `rent_roll`'s V2 columns are unverified (see Task 10). Before writing the aggregation:

- [ ] **Step 1: Verify `rent_roll`'s V2 columns**

Using the Developer Space access confirmed in this project's design conversation, go to `https://{database}.appfolio.com` → General Settings → Manage API Settings → Reports API Documentation → find "Rent Roll". Record its exact V2 column names for: unit count, square footage, occupancy status, market rent, actual rent, and lease expiration date. Update `src/reports/operations.data.ts`'s `rent_roll` entry: fill in `columns`, `filters`, and set `verified: true`.

- [ ] **Step 2: Write the failing tests, using the columns you just verified**

```ts
// src/composites/rentRollSummary.test.ts
// ABOUTME: Tests the rent_roll_summary composite's occupancy and rent-gap aggregation.
// ABOUTME: Field names below are placeholders — replace with the columns verified in Step 1.
import { describe, it, expect, vi } from "vitest";
import { rentRollSummary } from "./rentRollSummary";

// TODO(implementer): replace these placeholder field names with the verified V2 columns
// from Task 12 Step 1 before this test can pass against the real report shape.
const FIXTURE_ROWS = [
  { unit_count: 1, square_feet: 800, status: "Occupied", market_rent: "1500.00", rent: "1450.00", property_id: "p1" },
  { unit_count: 1, square_feet: 950, status: "Vacant", market_rent: "1700.00", rent: "0.00", property_id: "p1" },
];

describe("rentRollSummary", () => {
  it("computes occupancy by unit count and by square footage", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await rentRollSummary(reportsHttp, { asOf: "2026-08-13" });

    expect(result.portfolio.unitsOccupied).toBe(1);
    expect(result.portfolio.unitsVacant).toBe(1);
    expect(result.portfolio.squareFeetOccupied).toBe(800);
    expect(result.portfolio.squareFeetVacant).toBe(950);
  });

  it("computes the market-vs-actual rent gap for occupied units", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await rentRollSummary(reportsHttp, { asOf: "2026-08-13" });
    expect(result.portfolio.rentGap).toBeCloseTo(50, 5); // 1500 market - 1450 actual, occupied units only
  });

  it("rolls up per property", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await rentRollSummary(reportsHttp, { asOf: "2026-08-13" });
    expect(result.byProperty.p1.unitsOccupied).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/composites/rentRollSummary.test.ts`
Expected: FAIL — `Cannot find module './rentRollSummary'`

- [ ] **Step 4: Implement, using your Step-1-verified column names**

```ts
// src/composites/rentRollSummary.ts
// ABOUTME: Occupancy (by unit count and square footage) and market-vs-actual rent gap,
// ABOUTME: rolled up per property and portfolio-wide, from the verified rent_roll report.
// ABOUTME: Column name constants below must match Task 12 Step 1's verified V2 columns.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

// Replace with the verified V2 column names from Task 12 Step 1.
const COLUMNS = {
  status: "status",
  squareFeet: "square_feet",
  marketRent: "market_rent",
  rent: "rent",
  propertyId: "property_id",
} as const;

const OCCUPIED_STATUS = "Occupied";

interface PropertyTotals {
  unitsOccupied: number;
  unitsVacant: number;
  squareFeetOccupied: number;
  squareFeetVacant: number;
  rentGap: number;
}

function emptyTotals(): PropertyTotals {
  return { unitsOccupied: 0, unitsVacant: 0, squareFeetOccupied: 0, squareFeetVacant: 0, rentGap: 0 };
}

export async function rentRollSummary(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { asOf: string; properties?: string[] }
): Promise<{ portfolio: PropertyTotals; byProperty: Record<string, PropertyTotals> }> {
  const report = await runReport(reportsHttp, "rent_roll", { filters: { as_of: opts.asOf } });

  const portfolio = emptyTotals();
  const byProperty: Record<string, PropertyTotals> = {};

  for (const row of report.rows as Record<string, any>[]) {
    const propertyId = String(row[COLUMNS.propertyId]);
    if (opts.properties && !opts.properties.includes(propertyId)) continue;
    if (!byProperty[propertyId]) byProperty[propertyId] = emptyTotals();

    const occupied = row[COLUMNS.status] === OCCUPIED_STATUS;
    const sqft = Number(row[COLUMNS.squareFeet]) || 0;
    const gap = occupied ? Number(row[COLUMNS.marketRent]) - Number(row[COLUMNS.rent]) : 0;

    for (const totals of [portfolio, byProperty[propertyId]]) {
      if (occupied) {
        totals.unitsOccupied += 1;
        totals.squareFeetOccupied += sqft;
        totals.rentGap += gap;
      } else {
        totals.unitsVacant += 1;
        totals.squareFeetVacant += sqft;
      }
    }
  }

  return { portfolio, byProperty };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/composites/rentRollSummary.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the composite's doc contract**

```markdown
// docs/composites/rent-roll-summary.md
# rent_roll_summary

**Question it answers:** occupancy (by unit count and by square footage) and the market-vs-actual rent gap, per property and portfolio-wide.

**Report called:** `rent_roll` (Reports API V2). Verified against the live V2 catalog in Task 12 Step 1 — see `src/reports/operations.data.ts` for the exact columns.

**Definitions:**
- **Occupied** — the report's status column equals `Occupied` verbatim (not "Notice", not "Vacant-Rented"). Any other status counts as vacant for this tool's purposes.
- **Rent gap** — `market_rent - rent`, summed only over occupied units. Vacant units contribute 0, not their market rent, since there's no actual rent to compare against.
- **Square footage** — the report's per-unit square footage column, summed by occupancy status.

**Assumptions:** one row per unit per the report's own `as_of` semantics — this tool does not de-duplicate or re-derive occupancy from lease dates itself.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: rent_roll_summary composite (occupancy + rent gap)"
```

---

## Task 13: Composite — `delinquency_aging`

**Same pattern as Task 12 — verify before coding.**

- [ ] **Step 1: Verify `delinquency`'s V2 columns**

At Manage API Settings → Reports API Documentation, find "Delinquency". Record the V2 column names for: the aging buckets (0-30/30-60/60-90/90+ days), `in_collections`, `collections_agency`, `payment_plan`, `nsf`, `certified_funds_only`, `late_count`, and the tenant/property identifiers. Update `src/reports/operations.data.ts`'s `delinquency` entry and set `verified: true`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/composites/delinquencyAging.test.ts
// ABOUTME: Tests the delinquency_aging composite — aggregates AppFolio's own aging buckets
// ABOUTME: rather than re-deriving them, and surfaces the flags that separate "owes money"
// ABOUTME: from "is actually a collections problem".
import { describe, it, expect, vi } from "vitest";
import { delinquencyAging } from "./delinquencyAging";

// TODO(implementer): replace with the columns verified in Step 1.
const FIXTURE_ROWS = [
  { tenant_id: "t1", property_id: "p1", days_0_30: "100.00", days_30_60: "0.00", days_60_90: "0.00", days_90_plus: "0.00", in_collections: false, late_count: 1 },
  { tenant_id: "t2", property_id: "p1", days_0_30: "0.00", days_30_60: "0.00", days_60_90: "0.00", days_90_plus: "600.00", in_collections: true, late_count: 5 },
];

describe("delinquencyAging", () => {
  it("aggregates AppFolio's own aging buckets rather than re-deriving them", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await delinquencyAging(reportsHttp, { minBalance: 0 });
    expect(result.totals.days0To30).toBeCloseTo(100, 5);
    expect(result.totals.days90Plus).toBeCloseTo(600, 5);
  });

  it("filters out tenants below the minimum balance", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await delinquencyAging(reportsHttp, { minBalance: 500 });
    expect(result.tenants).toHaveLength(1);
    expect(result.tenants[0].tenantId).toBe("t2");
  });

  it("carries the collections and repeat-lateness flags through per tenant", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await delinquencyAging(reportsHttp, { minBalance: 0 });
    const t2 = result.tenants.find((t) => t.tenantId === "t2");
    expect(t2).toMatchObject({ inCollections: true, lateCount: 5 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/composites/delinquencyAging.test.ts`
Expected: FAIL — `Cannot find module './delinquencyAging'`

- [ ] **Step 4: Implement**

```ts
// src/composites/delinquencyAging.ts
// ABOUTME: Aggregates the delinquency report's own aging buckets (not re-derived arithmetic)
// ABOUTME: and surfaces collections/repeat-lateness flags alongside raw balances.
// ABOUTME: Column name constants below must match Task 13 Step 1's verified V2 columns.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

// Replace with the verified V2 column names from Task 13 Step 1.
const COLUMNS = {
  tenantId: "tenant_id",
  propertyId: "property_id",
  days0To30: "days_0_30",
  days30To60: "days_30_60",
  days60To90: "days_60_90",
  days90Plus: "days_90_plus",
  inCollections: "in_collections",
  lateCount: "late_count",
} as const;

function balance(row: Record<string, any>): number {
  return (
    Number(row[COLUMNS.days0To30]) +
    Number(row[COLUMNS.days30To60]) +
    Number(row[COLUMNS.days60To90]) +
    Number(row[COLUMNS.days90Plus])
  );
}

export interface DelinquentTenant {
  tenantId: string;
  propertyId: string;
  balance: number;
  inCollections: boolean;
  lateCount: number;
}

export async function delinquencyAging(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { minBalance: number; properties?: string[] }
): Promise<{
  totals: { days0To30: number; days30To60: number; days60To90: number; days90Plus: number };
  tenants: DelinquentTenant[];
}> {
  const report = await runReport(reportsHttp, "delinquency", {});

  const totals = { days0To30: 0, days30To60: 0, days60To90: 0, days90Plus: 0 };
  const tenants: DelinquentTenant[] = [];

  for (const row of report.rows as Record<string, any>[]) {
    const propertyId = String(row[COLUMNS.propertyId]);
    if (opts.properties && !opts.properties.includes(propertyId)) continue;

    totals.days0To30 += Number(row[COLUMNS.days0To30]);
    totals.days30To60 += Number(row[COLUMNS.days30To60]);
    totals.days60To90 += Number(row[COLUMNS.days60To90]);
    totals.days90Plus += Number(row[COLUMNS.days90Plus]);

    const bal = balance(row);
    if (bal < opts.minBalance) continue;
    tenants.push({
      tenantId: String(row[COLUMNS.tenantId]),
      propertyId,
      balance: bal,
      inCollections: Boolean(row[COLUMNS.inCollections]),
      lateCount: Number(row[COLUMNS.lateCount]),
    });
  }

  return { totals, tenants };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/composites/delinquencyAging.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the composite's doc contract**

```markdown
// docs/composites/delinquency-aging.md
# delinquency_aging

**Question it answers:** who owes money, how overdue, and which of them are actually a collections problem rather than routine lateness.

**Report called:** `delinquency` (Reports API V2). Verified against the live V2 catalog in Task 13 Step 1.

**Definitions:**
- **Aging buckets** — this tool sums the report's own 0-30/30-60/60-90/90+ columns; it does not compute aging from due dates itself. If AppFolio's bucket boundaries ever change, this tool's output changes with them automatically.
- **Balance** — sum of all four bucket columns for a tenant.
- **`minBalance` filter** — applied to that summed balance, not to any single bucket.

**Assumptions:** `in_collections`, `collections_agency` (not surfaced separately from `in_collections` yet), `payment_plan`, `nsf`, `certified_funds_only` exist on the verified report per the design spec but only `in_collections` and `late_count` are wired into this composite's output today — the rest are available on the raw report via `run_report` directly if needed.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: delinquency_aging composite"
```

---

## Task 14: Composite — `work_order_aging`

**Same verify-first pattern.**

- [ ] **Step 1: Verify `work_order`'s V2 columns**

At Manage API Settings → Reports API Documentation, find "Work Order" (or equivalent). Record V2 column names for: status, property, vendor, priority, created date, scheduled-start date, completed date, estimate-requested date, estimated date. Update `operations.data.ts`'s `work_order` entry and set `verified: true`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/composites/workOrderAging.test.ts
// ABOUTME: Tests work_order_aging's bucket-by-age grouping and its two stall signals that
// ABOUTME: the raw report doesn't volunteer on its own.
import { describe, it, expect, vi } from "vitest";
import { workOrderAging } from "./workOrderAging";

// TODO(implementer): replace with the columns verified in Step 1.
const FIXTURE_ROWS = [
  {
    property_id: "p1",
    vendor_id: "v1",
    priority: "High",
    status: "Open",
    created_at: "2026-07-01",
    scheduled_start: "2026-07-15",
    completed_on: null,
    estimate_requested_on: "2026-07-02",
    estimated_on: null,
  },
];

describe("workOrderAging", () => {
  it("buckets open work orders by age from created_at", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await workOrderAging(reportsHttp, { asOf: "2026-08-13" });
    expect(result.workOrders[0].ageDays).toBe(43);
  });

  it("flags a scheduled start in the past with no completion as stalled", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await workOrderAging(reportsHttp, { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).toContain("scheduled_start_passed");
  });

  it("flags an estimate requested with no estimate received as stalled", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await workOrderAging(reportsHttp, { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).toContain("estimate_overdue");
  });

  it("groups by property, vendor, and priority", async () => {
    const reportsHttp = { request: vi.fn().mockResolvedValue({ results: FIXTURE_ROWS }) };
    const result = await workOrderAging(reportsHttp, { asOf: "2026-08-13" });
    expect(result.byProperty.p1).toHaveLength(1);
    expect(result.byVendor.v1).toHaveLength(1);
    expect(result.byPriority.High).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/composites/workOrderAging.test.ts`
Expected: FAIL — `Cannot find module './workOrderAging'`

- [ ] **Step 4: Implement**

```ts
// src/composites/workOrderAging.ts
// ABOUTME: Age buckets for open work orders plus two stall signals the raw report won't
// ABOUTME: volunteer: a scheduled start that's passed with no completion, and an overdue estimate.
// ABOUTME: Column name constants below must match Task 14 Step 1's verified V2 columns.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

// Replace with the verified V2 column names from Task 14 Step 1.
const COLUMNS = {
  propertyId: "property_id",
  vendorId: "vendor_id",
  priority: "priority",
  status: "status",
  createdAt: "created_at",
  scheduledStart: "scheduled_start",
  completedOn: "completed_on",
  estimateRequestedOn: "estimate_requested_on",
  estimatedOn: "estimated_on",
} as const;

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

export interface AgedWorkOrder {
  propertyId: string;
  vendorId: string;
  priority: string;
  ageDays: number;
  stalled: string[];
}

export async function workOrderAging(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { asOf: string; properties?: string[]; status?: string }
): Promise<{ workOrders: AgedWorkOrder[]; byProperty: Record<string, AgedWorkOrder[]>; byVendor: Record<string, AgedWorkOrder[]>; byPriority: Record<string, AgedWorkOrder[]> }> {
  const report = await runReport(reportsHttp, "work_order", {});

  const workOrders: AgedWorkOrder[] = [];
  const byProperty: Record<string, AgedWorkOrder[]> = {};
  const byVendor: Record<string, AgedWorkOrder[]> = {};
  const byPriority: Record<string, AgedWorkOrder[]> = {};

  for (const row of report.rows as Record<string, any>[]) {
    const propertyId = String(row[COLUMNS.propertyId]);
    if (opts.properties && !opts.properties.includes(propertyId)) continue;
    if (opts.status && row[COLUMNS.status] !== opts.status) continue;

    const stalled: string[] = [];
    if (row[COLUMNS.scheduledStart] && !row[COLUMNS.completedOn] && new Date(row[COLUMNS.scheduledStart]) < new Date(opts.asOf)) {
      stalled.push("scheduled_start_passed");
    }
    if (row[COLUMNS.estimateRequestedOn] && !row[COLUMNS.estimatedOn]) {
      stalled.push("estimate_overdue");
    }

    const entry: AgedWorkOrder = {
      propertyId,
      vendorId: String(row[COLUMNS.vendorId]),
      priority: String(row[COLUMNS.priority]),
      ageDays: daysBetween(row[COLUMNS.createdAt], opts.asOf),
      stalled,
    };

    workOrders.push(entry);
    (byProperty[entry.propertyId] ??= []).push(entry);
    (byVendor[entry.vendorId] ??= []).push(entry);
    (byPriority[entry.priority] ??= []).push(entry);
  }

  return { workOrders, byProperty, byVendor, byPriority };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/composites/workOrderAging.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the composite's doc contract**

```markdown
// docs/composites/work-order-aging.md
# work_order_aging

**Question it answers:** which open work orders are old or stalled, grouped by property, vendor, and priority.

**Report called:** `work_order` (Reports API V2). Verified against the live V2 catalog in Task 14 Step 1.

**Definitions:**
- **Age** — days between the report's created-date column and `asOf`, for every row returned (callers filter to open work orders via the `status` option; this tool does not assume a status value).
- **`scheduled_start_passed`** — the scheduled-start date is before `asOf` and there is no completion date. Distinct from age: a work order can be young but already past its own scheduled start.
- **`estimate_overdue`** — an estimate was requested but never received. Independent of scheduling — a work order can be neither scheduled nor estimated and would show both flags.

**Assumptions:** both stall signals are presence/absence checks on the verified report's own date columns — no external clock or vendor-side data is consulted.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: work_order_aging composite"
```

---

## Task 15: WorkOS AuthKit wiring

**Files:**
- Create: `src/auth/workos.ts`
- Test: `src/auth/workos.test.ts`

**Interfaces:**
- Consumes: `Config.workos` (Task 1).
- Produces: `resolveCaller(payload)`, `verifyToken(req, bearerToken, config)` matching `mcp-handler`'s `withMcpAuth` `verifyToken` signature (`(req: Request, bearerToken?: string) => Promise<AuthInfo | undefined>`) — consumed by the route handler (Task 16).

**Role resolution note:** WorkOS AuthKit authenticates *who* someone is; it doesn't know about `owner`/`admin`. This plan maps WorkOS organization membership to role: the WorkOS org's `admin` membership role → our `admin`; anything else (e.g. `member`) → our `owner`. Set this up in the WorkOS dashboard when inviting Justin (member) and yourself (admin) to the organization — this task assumes that mapping exists, it doesn't create it.

- [ ] **Step 1: Write the failing tests**

```ts
// src/auth/workos.test.ts
// ABOUTME: Tests WorkOS bearer-token verification and org-role → owner/admin mapping.
// ABOUTME: jwtVerify itself is mocked — this tests our wiring, not the jose library.
import { describe, it, expect, vi } from "vitest";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "JWKS_PLACEHOLDER"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
import { verifyToken, resolveRole } from "./workos";

const CONFIG = { clientId: "client_123", apiKey: "sk_test", authkitDomain: "https://auth.example.com" };

describe("resolveRole", () => {
  it("maps the WorkOS admin org role to admin", () => {
    expect(resolveRole("admin")).toBe("admin");
  });

  it("maps any other org role to owner", () => {
    expect(resolveRole("member")).toBe("owner");
  });
});

describe("verifyToken", () => {
  it("returns undefined when no bearer token is present", async () => {
    const result = await verifyToken(new Request("https://mcp.example.com"), undefined, CONFIG);
    expect(result).toBeUndefined();
  });

  it("returns AuthInfo with the resolved role in extra, for a valid token", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "user_123", org_role: "admin" },
    } as any);

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/auth/workos.test.ts`
Expected: FAIL — `Cannot find module './workos'`

- [ ] **Step 3: Implement `src/auth/workos.ts`**

```ts
// ABOUTME: Verifies WorkOS AuthKit bearer tokens for the remote MCP connector and maps
// ABOUTME: WorkOS org role to our owner/admin role — WorkOS knows identity, not our roles.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/auth/workos.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: WorkOS AuthKit token verification and role mapping"
```

---

## Task 16: Route assembly and Vercel deploy

**Files:**
- Create: `app/api/mcp/route.ts`
- Test: `app/api/mcp/route.test.ts` (integration-style, calling the exported handler directly)

**Interfaces:**
- Consumes: everything from Tasks 1–15.
- Produces: the deployed MCP endpoint itself. This is the last task — nothing downstream depends on it.

- [ ] **Step 1: Write a failing integration test**

```ts
// app/api/mcp/route.test.ts
// ABOUTME: Integration-style test: calls the exported route handler directly with a crafted
// ABOUTME: Request, verifying the tool list actually changes based on injected auth info.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/database/operations.generated", () => ({ DATABASE_OPERATIONS: [] }));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(), jwtVerify: vi.fn().mockRejectedValue(new Error("no token")) }));

import { POST } from "./route";

describe("MCP route", () => {
  it("rejects a request with no bearer token", async () => {
    const req = new Request("https://mcp.example.com/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/mcp/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement `app/api/mcp/route.ts`**

```ts
// ABOUTME: The single Next.js route serving the MCP endpoint — wires config, auth, the
// ABOUTME: database/reports/composite tool modules, and audit logging into one handler.
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { loadConfig } from "../../../src/config";
import { AppFolioHttpClient } from "../../../src/http";
import { createAuditNotifier } from "../../../src/audit";
import { scopeOperations } from "../../../src/database/roleScope";
import { DATABASE_OPERATIONS } from "../../../src/database/operations.generated";
import { listEndpoints, describeEndpoint, callEndpoint, confirmWrite, type CallEndpointDeps } from "../../../src/database/tools";
import { listReports, describeReport, runReport } from "../../../src/reports/tools";
import { vendorCompliance } from "../../../src/composites/vendorCompliance";
import { rentRollSummary } from "../../../src/composites/rentRollSummary";
import { delinquencyAging } from "../../../src/composites/delinquencyAging";
import { workOrderAging } from "../../../src/composites/workOrderAging";
import { verifyToken } from "../../../src/auth/workos";

const config = loadConfig();
const scopedOps = scopeOperations(DATABASE_OPERATIONS);
const notifyAudit = createAuditNotifier(config.auditSlackWebhookUrl);

const dbHttp = config.database
  ? new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: config.database.clientId,
      password: config.database.clientSecret,
      developerId: config.database.developerId,
    })
  : undefined;

const reportsHttp = config.reports
  ? new AppFolioHttpClient({
      baseUrl: `https://${config.reports.database}.appfolio.com/api/v2`,
      username: config.reports.clientId,
      password: config.reports.clientSecret,
    })
  : undefined;

const callEndpointDeps: CallEndpointDeps | undefined = dbHttp
  ? {
      ops: scopedOps,
      http: dbHttp,
      tokenSecret: config.tokenSecret,
      writesEnabled: config.writesEnabled,
      destructiveEnabled: config.destructiveEnabled,
      notifyAudit,
    }
  : undefined;

const handler = createMcpHandler((server) => {
  if (dbHttp && callEndpointDeps) {
    server.registerTool(
      "list_endpoints",
      { title: "List Database API endpoints", description: "List AppFolio Database API operations visible to you.", inputSchema: z.object({ search: z.string().optional(), tag: z.string().optional(), method: z.string().optional() }) },
      async ({ search, tag, method }, ctx) => {
        const role = ctx.http?.authInfo?.extra?.role ?? "owner";
        return { content: [{ type: "text", text: JSON.stringify(listEndpoints(scopedOps, { role }, { search, tag, method })) }] };
      }
    );

    server.registerTool(
      "describe_endpoint",
      { title: "Describe a Database API endpoint", description: "Full detail for one operation.", inputSchema: z.object({ operationId: z.string() }) },
      async ({ operationId }, ctx) => {
        const role = ctx.http?.authInfo?.extra?.role ?? "owner";
        return { content: [{ type: "text", text: JSON.stringify(describeEndpoint(scopedOps, { role }, operationId)) }] };
      }
    );

    server.registerTool(
      "call_endpoint",
      { title: "Call a Database API endpoint", description: "Reads execute immediately; writes return a preview and confirm token.", inputSchema: z.object({ operationId: z.string(), pathParams: z.record(z.string()).optional(), query: z.record(z.string()).optional(), body: z.unknown().optional() }) },
      async ({ operationId, pathParams, query, body }, ctx) => {
        const role = ctx.http?.authInfo?.extra?.role ?? "owner";
        const result = await callEndpoint(callEndpointDeps, { role }, operationId, { pathParams, query, body });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "confirm_write",
      { title: "Confirm a previewed write", description: "Executes the exact request encoded in a confirm token from call_endpoint.", inputSchema: z.object({ token: z.string() }) },
      async ({ token }, ctx) => {
        const role = ctx.http?.authInfo?.extra?.role ?? "owner";
        const result = await confirmWrite(callEndpointDeps, { role }, token);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );
  }

  if (reportsHttp) {
    server.registerTool(
      "list_reports",
      { title: "List reports", description: "List AppFolio Reports API V2 reports.", inputSchema: z.object({ search: z.string().optional() }) },
      async ({ search }) => ({ content: [{ type: "text", text: JSON.stringify(listReports(search)) }] })
    );
    server.registerTool(
      "describe_report",
      { title: "Describe a report", description: "Columns, filters, and verification status for one report.", inputSchema: z.object({ reportId: z.string() }) },
      async ({ reportId }) => ({ content: [{ type: "text", text: JSON.stringify(describeReport(reportId)) }] })
    );
    server.registerTool(
      "run_report",
      { title: "Run a report", description: "Executes a verified report. Unverified reports are refused.", inputSchema: z.object({ reportId: z.string(), filters: z.record(z.unknown()).optional(), columns: z.array(z.string()).optional(), maxRows: z.number().optional() }) },
      async ({ reportId, filters, columns, maxRows }) => ({ content: [{ type: "text", text: JSON.stringify(await runReport(reportsHttp, reportId, { filters, columns, maxRows })) }] })
    );

    server.registerTool(
      "vendor_compliance",
      { title: "Vendor compliance", description: "Vendors with insurance/licenses expiring soon, grouped by property.", inputSchema: z.object({ withinDays: z.number().default(30), asOf: z.string() }) },
      async ({ withinDays, asOf }, ctx) => {
        const role = ctx.http?.authInfo?.extra?.role ?? "owner";
        const result = await vendorCompliance({ reportsHttp, callEndpoint, callEndpointDeps }, { role }, { withinDays, asOf });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );
    server.registerTool(
      "rent_roll_summary",
      { title: "Rent roll summary", description: "Occupancy and rent gap by property and portfolio.", inputSchema: z.object({ asOf: z.string(), properties: z.array(z.string()).optional() }) },
      async ({ asOf, properties }) => ({ content: [{ type: "text", text: JSON.stringify(await rentRollSummary(reportsHttp, { asOf, properties })) }] })
    );
    server.registerTool(
      "delinquency_aging",
      { title: "Delinquency aging", description: "Aging balances plus collections/repeat-lateness flags.", inputSchema: z.object({ minBalance: z.number().default(0), properties: z.array(z.string()).optional() }) },
      async ({ minBalance, properties }) => ({ content: [{ type: "text", text: JSON.stringify(await delinquencyAging(reportsHttp, { minBalance, properties })) }] })
    );
    server.registerTool(
      "work_order_aging",
      { title: "Work order aging", description: "Age and stall signals for open work orders.", inputSchema: z.object({ asOf: z.string(), properties: z.array(z.string()).optional(), status: z.string().optional() }) },
      async ({ asOf, properties, status }) => ({ content: [{ type: "text", text: JSON.stringify(await workOrderAging(reportsHttp, { asOf, properties, status })) }] })
    );
  }
});

const authHandler = withMcpAuth(handler, (req, bearerToken) => verifyToken(req, bearerToken, config.workos), {
  required: true,
});

export { authHandler as GET, authHandler as POST };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/mcp/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: assemble the MCP route handler with WorkOS auth"
```

- [ ] **Step 6: Manual deploy verification (not automatable — do this by hand)**

1. Create the new Vercel project (`appfolio-mcp`, per the design spec's decision against reusing `mhb-lead-machine`) and link this repo.
2. Set all env vars from `.env.example` in Vercel's dashboard for the Production environment — including the real Perpetual Realty AppFolio credentials and the WorkOS values.
3. Deploy. Confirm the deployed URL responds (a `tools/list` call over the MCP Streamable HTTP transport should 401 without a token, matching Task 16's test).
4. As a WorkOS org Owner, add yourself and Justin to the WorkOS organization with the `admin`/`member` roles respectively (per Task 15's role-mapping note).
5. As the Vercel/Team account Owner, add the custom connector at Organization Settings → Connectors → Add → Custom → Web, using the deployed URL.
6. Have Justin connect from his own Claude Team account (Customize → Connectors → Connect) and confirm `list_endpoints`/`list_reports` return the `owner`-scoped view — no destructive operations listed, admin-only writes shown but marked `callable: false`.
7. Confirm a `call_endpoint` write (e.g. `createWorkOrderNote`) returns a preview and posts to `#appfolio-mcp-audit`, and that `confirm_write` executes it and posts the outcome.

