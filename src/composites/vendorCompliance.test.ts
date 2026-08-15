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
    // Opaque to this unit test: vendorCompliance just forwards it to callEndpoint, which is
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
