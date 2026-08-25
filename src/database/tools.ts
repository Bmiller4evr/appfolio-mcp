// ABOUTME: MCP tool implementations over the role-scoped Database API catalog: discovery
// ABOUTME: (list/describe) and the execute/write path (callEndpoint, confirmWrite).
import type { Role } from "../config";
import type { ScopedOperation } from "./roleScope";
import { search, describe as describeItem } from "../catalog/registry";
import type { AppFolioHttpClient } from "../http";
import { createConfirmToken, verifyConfirmToken, type PendingWrite } from "./confirmToken";

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
    reason: callable ? undefined : "admin-only, ask Bret to enable",
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
  if (opts.method) {
    const method = opts.method.toUpperCase();
    visible = visible.filter((op) => op.method === method);
  }
  visible = search(
    visible.map((op) => ({ ...op, id: op.operationId, title: op.summary })),
    opts.search
  ) as unknown as ScopedOperation[];
  return visible.map((op) => toListing(op, caller));
}

// Everything a caller needs to build the request: the operation's scope plus its path params,
// its query params under the exact keys AppFolio expects, its body properties, and any
// constraint AppFolio enforces at request time without stating it in the schema.
export interface EndpointDescription extends ScopedOperation {
  notes: string[];
}

// AppFolio's spec marks every filter key optional, but its server refuses an unfiltered GET list
// request with a plain-text 400 naming a filter the caller never saw mentioned. The constraint is
// real and unexpressible in the schema, so it is stated here rather than left to be discovered by
// failing a call.
const GET_LIST_FILTER_NOTE =
  "AppFolio answers this request with a 400 unless it carries at least one of filters[Id] or " +
  "filters[LastUpdatedAtFrom], even though the schema marks every filter optional. Filter keys go " +
  "on the query string under the bracketed names listed in queryParams, e.g. " +
  "filters[LastUpdatedAtFrom]=2026-08-01T00:00:00Z; a flat LastUpdatedAtFrom is ignored and earns " +
  "the same 400.";

function hasFiltersParam(op: ScopedOperation): boolean {
  return op.queryParams.some((param) => param.name === "filters" || param.name.startsWith("filters["));
}

export function describeEndpoint(ops: ScopedOperation[], caller: CallerContext, operationId: string): EndpointDescription {
  const visible = discoverableTo(ops, caller);
  const op = describeItem(
    visible.map((o) => ({ ...o, id: o.operationId, title: o.summary })),
    operationId
  );
  if (!op) throw new NotFoundError(`Unknown operation: ${operationId}`);
  const found = visible.find((o) => o.operationId === operationId)!;
  const notes = found.method === "GET" && hasFiltersParam(found) ? [GET_LIST_FILTER_NOTE] : [];
  return { ...found, notes };
}

export class PermissionError extends Error {}
export class WritesDisabledError extends Error {}
export class InvalidTokenError extends Error {}
export class InvalidPathParamError extends Error {}

export interface AuditEvent {
  type: "preview" | "confirmed";
  operationId?: string;
  caller: Role;
  url: string;
  // "rejected": authorization failed, so no request was ever sent to AppFolio. On a "preview"
  // event the caller's role or the write flags refused the write before any preview was minted;
  // on a "confirmed" event the token was valid but re-authorization at confirm time failed
  // (role/flags changed since the preview).
  outcome?: "success" | "failure" | "rejected";
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

// A path param is substituted into the operation's URL path template, and the WHATWG URL
// constructor in AppFolioHttpClient resolves ".." segments, so an unchecked value can walk out
// of the operation's own path and reach an endpoint the caller's role scope excludes (e.g.
// updateVendor with vendorId "../tenants/123" becomes PATCH /tenants/123). Values carrying
// path, query, or fragment syntax are refused outright; anything accepted is percent-encoded
// so it can only ever be a single path segment.
const PATH_PARAM_SEPARATORS = /[/\\?#]|\.\./;

// A leading dot also has to be refused on its own: "." isn't caught by PATH_PARAM_SEPARATORS
// (no ".." there), but new URL() still collapses a "/./" segment away, silently turning
// "/work_orders/./notes" into "/work_orders/notes". An empty value is refused for the same
// class of reason: encodeURIComponent("") is "", which collapses "/vendors/{vendorId}" down
// to the collection endpoint "/vendors/" instead of a single resource.
function resolvePath(path: string, pathParams: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_match, name) => {
    const value = pathParams[name];
    if (value === undefined) throw new PermissionError(`Missing path param: ${name}`);
    if (value === "" || value.startsWith(".") || PATH_PARAM_SEPARATORS.test(value)) {
      throw new InvalidPathParamError(
        `Invalid path param ${name}: must be a non-empty single path segment, without / \\ ? # or .., and not starting with .`
      );
    }
    return encodeURIComponent(value);
  });
}

// Undiscoverable operations (e.g. DESTRUCTIVE ops for a non-admin caller) are reported as
// NotFoundError, matching describeEndpoint: a PermissionError here would confirm to the
// caller that the operation exists, which is exactly what discoverableBy is meant to hide.
function findDiscoverable(ops: ScopedOperation[], caller: CallerContext, operationId: string): ScopedOperation {
  const op = ops.find((o) => o.operationId === operationId && o.discoverableBy.includes(caller.role));
  if (!op) throw new NotFoundError(`Unknown operation: ${operationId}`);
  return op;
}

// Shared by callEndpoint (before minting a preview) and confirmWrite (before executing a
// confirmed token), so a token can never execute under authorization weaker than what minted
// it: same role/flag checks, re-run fresh against current deps at confirm time.
function assertWriteAuthorized(deps: CallEndpointDeps, caller: CallerContext, op: ScopedOperation): void {
  if (!op.executableBy.includes(caller.role)) {
    throw new PermissionError(`${op.operationId} requires admin role, ask Bret to enable it`);
  }
  if (op.class === "DESTRUCTIVE" && !deps.destructiveEnabled) {
    throw new WritesDisabledError(`${op.operationId} is destructive and destructive writes are disabled`);
  }
  if (!deps.writesEnabled) {
    throw new WritesDisabledError(`${op.operationId} is a write and writes are disabled`);
  }
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

  // A write refused here is the most interesting event in the audit channel, so it is logged
  // like any other attempt, not dropped for never having reached a preview.
  try {
    assertWriteAuthorized(deps, caller, op);
  } catch (err) {
    await deps.notifyAudit({ type: "preview", operationId, caller: caller.role, url, outcome: "rejected" });
    throw err;
  }

  const write: PendingWrite = { method: op.method, url, body: params.body, operationId: op.operationId };
  const confirmToken = createConfirmToken(write, deps.tokenSecret);
  await deps.notifyAudit({ type: "preview", operationId, caller: caller.role, url });
  return { executed: false, preview: write, confirmToken };
}

export async function confirmWrite(deps: CallEndpointDeps, caller: CallerContext, token: string): Promise<unknown> {
  const write = verifyConfirmToken(token, deps.tokenSecret);
  if (!write) throw new InvalidTokenError("Confirm token is invalid or expired");

  // Re-check the operation's role/flags at confirm time, not just the token's signature: a
  // token minted under one caller's permissions (or under flags that have since changed) must
  // not execute just because it's still validly signed and unexpired.
  try {
    const op = findDiscoverable(deps.ops, caller, write.operationId);
    assertWriteAuthorized(deps, caller, op);
  } catch (err) {
    await deps.notifyAudit({
      type: "confirmed",
      operationId: write.operationId,
      caller: caller.role,
      url: write.url,
      outcome: "rejected",
    });
    throw err;
  }

  let result: unknown;
  try {
    result = await deps.http.request(write.method, write.url, { body: write.body });
  } catch (err) {
    await deps.notifyAudit({
      type: "confirmed",
      operationId: write.operationId,
      caller: caller.role,
      url: write.url,
      outcome: "failure",
    });
    throw err;
  }

  // The write already succeeded against AppFolio at this point. A failure notifying audit
  // (e.g. Slack webhook down) must never be reported as a write failure, and must never log a
  // false "failure" outcome for a write that actually went through: these are non-idempotent
  // operations, and a caller retrying after a false failure would produce a duplicate write.
  try {
    await deps.notifyAudit({
      type: "confirmed",
      operationId: write.operationId,
      caller: caller.role,
      url: write.url,
      outcome: "success",
    });
  } catch (notifyErr) {
    console.error("confirmWrite: post-success audit notification failed", notifyErr);
  }
  return result;
}
