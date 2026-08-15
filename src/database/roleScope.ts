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
