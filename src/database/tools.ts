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

export function describeEndpoint(ops: ScopedOperation[], caller: CallerContext, operationId: string): ScopedOperation {
  const visible = discoverableTo(ops, caller);
  const op = describeItem(
    visible.map((o) => ({ ...o, id: o.operationId, title: o.summary })),
    operationId
  );
  if (!op) throw new NotFoundError(`Unknown operation: ${operationId}`);
  return visible.find((o) => o.operationId === operationId)!;
}

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

// Undiscoverable operations (e.g. DESTRUCTIVE ops for a non-admin caller) are reported as
// NotFoundError, matching describeEndpoint: a PermissionError here would confirm to the
// caller that the operation exists, which is exactly what discoverableBy is meant to hide.
function findDiscoverable(ops: ScopedOperation[], caller: CallerContext, operationId: string): ScopedOperation {
  const op = ops.find((o) => o.operationId === operationId && o.discoverableBy.includes(caller.role));
  if (!op) throw new NotFoundError(`Unknown operation: ${operationId}`);
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
    throw new PermissionError(`${operationId} requires admin role, ask Bret to enable it`);
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
