// ABOUTME: Tests role-scope classification against both the real generated catalog and
// ABOUTME: specific known operations, to lock in the counts from the design spec.
import { describe, it, expect } from "vitest";
import { classifyOperation, scopeOperations, OWNER_WRITE_OPERATION_IDS } from "./roleScope";
import { DATABASE_OPERATIONS } from "./operations.generated";
import type { RawOperation } from "./catalogGen";

// Classification reads only method/operationId/path, so these fixtures leave the request-shape
// fields empty rather than restating parameter detail no assertion here looks at.
const rawOp = (op: Omit<RawOperation, "pathParams" | "queryParams">): RawOperation => ({
  ...op,
  pathParams: [],
  queryParams: [],
});

describe("classifyOperation", () => {
  it("classifies GET as READ, discoverable and executable by both roles", () => {
    const op = rawOp({ method: "GET", path: "/tenants", operationId: "getTenants", summary: "", tag: "Tenants" });
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("READ");
    expect(scoped.executableBy).toEqual(["owner", "admin"]);
    expect(scoped.discoverableBy).toEqual(["owner", "admin"]);
  });

  it("classifies DELETE as DESTRUCTIVE, hidden from owner entirely", () => {
    const op = rawOp({
      method: "DELETE",
      path: "/units/{UnitId}/photos/{PhotoId}",
      operationId: "deleteUnitPhoto",
      summary: "",
      tag: "Units",
    });
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("DESTRUCTIVE");
    expect(scoped.executableBy).toEqual(["admin"]);
    expect(scoped.discoverableBy).toEqual(["admin"]);
  });

  it("classifies bulk operations as DESTRUCTIVE even when the method is POST", () => {
    const op = rawOp({ method: "POST", path: "/tenants/bulk", operationId: "bulkCreateTenants", summary: "", tag: "Tenants" });
    expect(classifyOperation(op).class).toBe("DESTRUCTIVE");
  });

  it("classifies an owner-allowlisted write as WRITE, executable by both roles", () => {
    const op = rawOp({
      method: "POST",
      path: "/work_orders/{WorkOrderId}/notes",
      operationId: "createWorkOrderNote",
      summary: "",
      tag: "Work Orders",
    });
    const scoped = classifyOperation(op);
    expect(scoped.class).toBe("WRITE");
    expect(scoped.executableBy).toEqual(["owner", "admin"]);
  });

  it("classifies a non-allowlisted write as admin-only to execute but discoverable by owner", () => {
    const op = rawOp({ method: "PATCH", path: "/bills/{billId}", operationId: "updateBill", summary: "", tag: "Bills" });
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
