// ABOUTME: Tests the discovery tools' role-aware filtering: destructive ops are fully
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
