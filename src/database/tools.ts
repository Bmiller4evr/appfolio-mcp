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
