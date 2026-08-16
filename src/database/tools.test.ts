// ABOUTME: Tests the discovery tools' role-aware filtering: destructive ops are fully
// ABOUTME: invisible to owner; ordinary admin-only writes are visible but marked uncallable.
import { describe, it, expect, vi } from "vitest";
import {
  listEndpoints,
  describeEndpoint,
  NotFoundError,
  callEndpoint,
  confirmWrite,
  PermissionError,
  WritesDisabledError,
  InvalidTokenError,
  InvalidPathParamError,
} from "./tools";
import { verifyConfirmToken } from "./confirmToken";
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
  { method: "PATCH", path: "/vendors/{vendorId}", operationId: "updateVendor", summary: "Update a vendor", tag: "Vendors" },
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

describe("callEndpoint: reads", () => {
  it("executes GET operations directly without a confirm step", async () => {
    const deps = makeDeps();
    const result = await callEndpoint(deps, { role: "owner" }, "getTenants", {});
    expect(result).toEqual({ executed: true, result: { ok: true } });
    expect(deps.http.request).toHaveBeenCalledWith("GET", "/tenants", { query: undefined });
  });
});

describe("callEndpoint: writes", () => {
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
      operationId: "createWorkOrderNote",
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

  it("audits a role-denied write as rejected, without sending the request", async () => {
    const deps = makeDeps();
    await expect(callEndpoint(deps, { role: "owner" }, "updateBill", { pathParams: { id: "1" } })).rejects.toThrow(
      PermissionError
    );
    expect(deps.notifyAudit).toHaveBeenCalledWith({
      type: "preview",
      operationId: "updateBill",
      caller: "owner",
      url: "/bills/1",
      outcome: "rejected",
    });
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("audits a flag-disabled write as rejected, without sending the request", async () => {
    const deps = makeDeps({ writesEnabled: false });
    await expect(
      callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", { pathParams: { id: "42" }, body: {} })
    ).rejects.toThrow(WritesDisabledError);
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "preview", operationId: "createWorkOrderNote", caller: "owner", outcome: "rejected" })
    );
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("rejects a write with WritesDisabledError when writesEnabled is false", async () => {
    const deps = makeDeps({ writesEnabled: false });
    await expect(
      callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", { pathParams: { id: "42" }, body: {} })
    ).rejects.toThrow(WritesDisabledError);
  });

  it("rejects a write with WritesDisabledError for admin too when writesEnabled is false", async () => {
    const deps = makeDeps({ writesEnabled: false });
    await expect(
      callEndpoint(deps, { role: "admin" }, "createWorkOrderNote", { pathParams: { id: "42" }, body: {} })
    ).rejects.toThrow(WritesDisabledError);
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("throws NotFoundError, not PermissionError, for a destructive operation owner cannot even discover", async () => {
    const deps = makeDeps();
    await expect(
      callEndpoint(deps, { role: "owner" }, "deleteInspection", { pathParams: { id: "1" } })
    ).rejects.toThrow(NotFoundError);
  });

  it("blocks a destructive operation for admin when destructiveEnabled is false, without a preview", async () => {
    const deps = makeDeps({ destructiveEnabled: false });
    await expect(
      callEndpoint(deps, { role: "admin" }, "deleteInspection", { pathParams: { id: "1" } })
    ).rejects.toThrow(WritesDisabledError);
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "preview", operationId: "deleteInspection", caller: "admin", outcome: "rejected" })
    );
  });
});

describe("callEndpoint: path params", () => {
  it("rejects a path param that traverses out of the operation's own path", async () => {
    const deps = makeDeps();
    await expect(
      callEndpoint(deps, { role: "owner" }, "updateVendor", {
        pathParams: { vendorId: "../tenants/123" },
        body: { Name: "x" },
      })
    ).rejects.toThrow(InvalidPathParamError);
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("rejects a path param containing a path separator", async () => {
    const deps = makeDeps();
    await expect(
      callEndpoint(deps, { role: "owner" }, "updateVendor", { pathParams: { vendorId: "foo/bar" }, body: {} })
    ).rejects.toThrow(InvalidPathParamError);
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("rejects a path param carrying a query or fragment marker", async () => {
    const deps = makeDeps();
    await expect(
      callEndpoint(deps, { role: "owner" }, "updateVendor", { pathParams: { vendorId: "1?x=2" }, body: {} })
    ).rejects.toThrow(InvalidPathParamError);
    await expect(
      callEndpoint(deps, { role: "owner" }, "updateVendor", { pathParams: { vendorId: "1#frag" }, body: {} })
    ).rejects.toThrow(InvalidPathParamError);
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("percent-encodes an accepted path param", async () => {
    const deps = makeDeps();
    const result = await callEndpoint(deps, { role: "owner" }, "updateVendor", {
      pathParams: { vendorId: "a b" },
      body: {},
    });
    if (result.executed) throw new Error("unreachable");
    expect(result.preview.url).toBe("/vendors/a%20b");
  });

  it('accepts "0" as a path param value', async () => {
    const deps = makeDeps();
    const result = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "0" },
      body: { Note: "x" },
    });
    if (result.executed) throw new Error("unreachable");
    expect(result.preview.url).toBe("/work_orders/0/notes");
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
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).not.toHaveBeenCalled();
  });

  it("rejects a tampered token with InvalidTokenError", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "x" },
    });
    if (preview.executed) throw new Error("unreachable");
    const [payloadB64, signature] = preview.confirmToken.split(".");
    const tampered = payloadB64 + "x." + signature;

    await expect(confirmWrite(deps, { role: "owner" }, tampered)).rejects.toThrow(InvalidTokenError);
    expect(deps.http.request).not.toHaveBeenCalled();
  });

  it("rejects an expired token with InvalidTokenError", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "x" },
    });
    if (preview.executed) throw new Error("unreachable");

    vi.setSystemTime(new Date("2026-01-01T00:16:00Z")); // 16 minutes later, past the 15-minute TTL
    await expect(confirmWrite(deps, { role: "owner" }, preview.confirmToken)).rejects.toThrow(InvalidTokenError);
    expect(deps.http.request).not.toHaveBeenCalled();
    vi.useRealTimers();
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

  it("still returns the successful result even when the post-success audit notification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "x" },
    });
    if (preview.executed) throw new Error("unreachable");
    deps.notifyAudit = vi.fn().mockRejectedValue(new Error("Slack webhook down"));

    const result = await confirmWrite(deps, { role: "owner" }, preview.confirmToken);

    expect(result).toEqual({ ok: true });
    expect(deps.http.request).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "confirmWrite: post-success audit notification failed",
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  it("re-validation: a token minted for an owner-executable write still succeeds when confirmed by owner", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "x" },
    });
    if (preview.executed) throw new Error("unreachable");

    const result = await confirmWrite(deps, { role: "owner" }, preview.confirmToken);

    expect(result).toEqual({ ok: true });
    expect(deps.http.request).toHaveBeenCalledTimes(1);
  });

  it("re-validation: a token minted for an admin-only write is rejected at confirm time if presented by owner", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "admin" }, "updateBill", {
      pathParams: { id: "1" },
      body: { Amount: 100 },
    });
    if (preview.executed) throw new Error("unreachable");

    await expect(confirmWrite(deps, { role: "owner" }, preview.confirmToken)).rejects.toThrow(PermissionError);
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "confirmed", caller: "owner", outcome: "rejected" })
    );
  });

  it("re-validation: a token minted while writes were enabled is rejected at confirm time once writesEnabled flips false", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "owner" }, "createWorkOrderNote", {
      pathParams: { id: "42" },
      body: { Note: "x" },
    });
    if (preview.executed) throw new Error("unreachable");

    deps.writesEnabled = false;

    await expect(confirmWrite(deps, { role: "owner" }, preview.confirmToken)).rejects.toThrow(WritesDisabledError);
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "confirmed", caller: "owner", outcome: "rejected" })
    );
  });

  it("re-validation: a token minted for a destructive operation is rejected at confirm time if presented by owner", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "admin" }, "deleteInspection", {
      pathParams: { id: "1" },
    });
    if (preview.executed) throw new Error("unreachable");

    await expect(confirmWrite(deps, { role: "owner" }, preview.confirmToken)).rejects.toThrow(NotFoundError);
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "confirmed", operationId: "deleteInspection", caller: "owner", outcome: "rejected" })
    );
  });

  it("re-validation: a token minted for a destructive operation is rejected at confirm time once destructiveEnabled flips false", async () => {
    const deps = makeDeps();
    const preview = await callEndpoint(deps, { role: "admin" }, "deleteInspection", {
      pathParams: { id: "1" },
    });
    if (preview.executed) throw new Error("unreachable");

    deps.destructiveEnabled = false;

    await expect(confirmWrite(deps, { role: "admin" }, preview.confirmToken)).rejects.toThrow(WritesDisabledError);
    expect(deps.http.request).not.toHaveBeenCalled();
    expect(deps.notifyAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "confirmed", caller: "admin", outcome: "rejected" })
    );
  });
});
