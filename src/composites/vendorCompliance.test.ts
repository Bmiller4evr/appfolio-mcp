// ABOUTME: Tests the vendor_compliance composite's joins: vendor_directory (no property column)
// ABOUTME: attributed to properties via work_orders, with those properties resolved to names.
import { describe, it, expect, vi } from "vitest";
import { vendorCompliance } from "./vendorCompliance";
import type { CallEndpointResult } from "../database/tools";

// The live vendor_directory row shape, read off a real POST /reports/vendor_directory: no "id"
// column exists at all. Identity is split between vendor_id (the number AppFolio's own UI shows)
// and vendor_integration_id (the UUID every Database API record refers to a vendor by), and the
// human label is company_name, with name holding the contact person and often being the only one
// of the two that is filled in.
const AMBRIZ = {
  company_name: null,
  name: "Ambriz, Noe",
  vendor_id: 296,
  vendor_integration_id: "84387964-02a0-11f1-94c6-06d5233d324d",
  vendor_type: "General",
  liability_ins_expires: "2026-09-01",
  workers_comp_expires: "2027-01-01",
};
const APEX = {
  company_name: "Apex Service Professionals",
  name: "Rains, Chris",
  vendor_id: 7,
  vendor_integration_id: "e0057b85-70e4-11ec-bbe6-06029f0c0e3c",
  vendor_type: "General",
  liability_ins_expires: "2027-06-01",
  workers_comp_expires: "2027-06-01",
};
const BESTCARE = {
  company_name: "Bestcare Home Services, LLC",
  name: "Rhodes, Thomas",
  vendor_id: 204,
  vendor_integration_id: "040916de-00b2-11ef-8125-064d511af0f3",
  vendor_type: "General",
  liability_ins_expires: "2026-08-20",
  workers_comp_expires: null,
};

const STALLION = { Id: "558864fa-4bba-11ec-88d8-02c07545a9a5", Name: "242 Stallion Drive", Address1: "242 Stallion Drive" };
const SOUTHMOOR = { Id: "538ce36c-4bba-11ec-88d8-02c07545a9a5", Name: "1044 Southmoor Drive", Address1: "1044 Southmoor Drive - 1" };
const WEST_HILLS = { Id: "53643ef0-4bba-11ec-88d8-02c07545a9a5", Name: "1001 West Hills Terrace", Address1: "1001 West Hills Terrace" };

function makeDeps() {
  const properties = new Map([
    [STALLION.Id, STALLION],
    [SOUTHMOOR.Id, SOUTHMOOR],
    [WEST_HILLS.Id, WEST_HILLS],
  ]);
  return {
    reportsHttp: {
      request: vi.fn().mockResolvedValue({ results: [AMBRIZ, APEX] }),
    },
    // callEndpoint already follows every page of a Database API list read itself, so what a caller
    // gets back is always the fully joined { data, truncated } shape, PascalCase fields. A work
    // order's VendorId is the vendor's UUID, matching vendor_directory's vendor_integration_id.
    callEndpoint: vi.fn(async (_deps: unknown, _caller: unknown, operationId: string, params: any): Promise<CallEndpointResult> => {
      if (operationId === "getWorkOrders") {
        return {
          executed: true,
          result: {
            data: [
              { VendorId: AMBRIZ.vendor_integration_id, PropertyId: STALLION.Id },
              { VendorId: AMBRIZ.vendor_integration_id, PropertyId: SOUTHMOOR.Id },
            ],
            truncated: false,
          },
        };
      }
      const asked = String(params.query["filters[Id]"]).split(",");
      return {
        executed: true,
        result: { data: asked.map((id) => properties.get(id)).filter(Boolean), truncated: false },
      };
    }),
    // Route assembly (Task 16) provides the real CallEndpointDeps; nothing in this unit test
    // reaches into it directly, callEndpoint (mocked above) is what vendorCompliance actually calls.
    callEndpointDeps: {} as any,
  };
}

describe("vendorCompliance", () => {
  it("filters vendors whose insurance expires within the window and attributes them to properties", async () => {
    const deps = makeDeps();
    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0]).toMatchObject({
      id: AMBRIZ.vendor_integration_id,
      vendorId: 296,
      name: "Ambriz, Noe",
      vendorType: "General",
      properties: [
        { id: STALLION.Id, name: "242 Stallion Drive" },
        { id: SOUTHMOOR.Id, name: "1044 Southmoor Drive" },
      ],
    });
  });

  // vendor_directory has no "id" column, so reading one yields undefined: JSON.stringify drops
  // the key on the way out and every vendor arrives unidentifiable, while the property join,
  // keyed by that same undefined, matches nothing and reports every vendor as having worked
  // nowhere. Both halves of that are asserted here.
  it("identifies each vendor by the columns the report actually returns", async () => {
    const deps = makeDeps();
    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    const vendor = result.vendors[0];
    expect(vendor.id).toBeDefined();
    expect(vendor.vendorId).toBeDefined();
    expect(vendor.name).toBeDefined();
    expect(vendor.properties.length).toBeGreaterThan(0);
  });

  // A vendor's business name is the useful label, and it lives in company_name; name holds the
  // contact person and is the only one filled in for the sole proprietors that make up a large
  // part of a real directory.
  it("labels a vendor by its company name, falling back to the contact name", async () => {
    const deps = makeDeps();
    deps.reportsHttp.request.mockResolvedValue({
      results: [{ ...BESTCARE }, { ...AMBRIZ }],
    });

    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(result.vendors.map((v) => v.name)).toEqual(["Bestcare Home Services, LLC", "Ambriz, Noe"]);
  });

  it("calls the report with the expiration filter pushed server-side", async () => {
    const deps = makeDeps();
    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });
    expect(deps.reportsHttp.request).toHaveBeenCalledWith("POST", "/reports/vendor_directory", {
      body: { liability_expiration_to: "2026-09-12" },
    });
  });

  it("goes through the role-scoped callEndpoint for the work_orders join, not a private route", async () => {
    const deps = makeDeps();
    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });
    expect(deps.callEndpoint).toHaveBeenCalledWith(expect.anything(), { role: "owner" }, "getWorkOrders", {
      query: { "filters[LastUpdatedAtFrom]": "2016-08-15T00:00:00Z" },
    });
  });

  // AppFolio rejects an unfiltered GET list request outright ("400: This GET request must include
  // a filter for [Id] or [LastUpdatedAtFrom]"), and only accepts the filter under its bracketed
  // deepObject key, so an empty query or a flat key never reaches any work order data.
  it("filters work orders by a bracketed LastUpdatedAtFrom reaching far enough back to be useful", async () => {
    const deps = makeDeps();
    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    const query = deps.callEndpoint.mock.calls[0][3].query as Record<string, string>;
    expect(Object.keys(query)).toEqual(["filters[LastUpdatedAtFrom]"]);
    const from = query["filters[LastUpdatedAtFrom]"];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(new Date(from).getTime()).toBeLessThan(new Date("2021-08-13").getTime());
  });

  // A property an AppFolio user has since hidden (sold, off management) still owns the work order
  // history that attributed a vendor to it, and getProperties answers filters[Id] for it with an
  // empty data array unless IncludeHidden comes along, so without the flag a legitimately matched
  // property silently disappears from the join.
  it("asks for hidden properties too, in one batched lookup rather than one call per property", async () => {
    const deps = makeDeps();
    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    const propertyCalls = deps.callEndpoint.mock.calls.filter((call) => call[2] === "getProperties");
    expect(propertyCalls).toHaveLength(1);
    expect(propertyCalls[0][3].query["filters[IncludeHidden]"]).toBe("true");
    expect(propertyCalls[0][3].query["filters[Id]"]).toBe(`${STALLION.Id},${SOUTHMOOR.Id}`);
  });

  it("keeps a property whose record the lookup never returns, rather than dropping it", async () => {
    const deps = makeDeps();
    deps.callEndpoint.mockImplementation(async (_deps, _caller, operationId): Promise<CallEndpointResult> => {
      if (operationId === "getWorkOrders") {
        return {
          executed: true,
          result: { data: [{ VendorId: AMBRIZ.vendor_integration_id, PropertyId: STALLION.Id }], truncated: false },
        };
      }
      return { executed: true, result: { data: [], truncated: false } };
    });

    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(result.vendors[0].properties).toEqual([{ id: STALLION.Id, name: null }]);
  });

  // A work order read cut short means a vendor can be attributed to fewer properties than it has
  // worked at, which reads exactly like a vendor that has done less work. That has to be said out
  // loud rather than passed off as a complete answer.
  it("reports a work order read that came back truncated", async () => {
    const deps = makeDeps();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    deps.callEndpoint.mockImplementation(async (_deps, _caller, operationId): Promise<CallEndpointResult> => {
      if (operationId === "getWorkOrders") {
        return {
          executed: true,
          result: { data: [{ VendorId: AMBRIZ.vendor_integration_id, PropertyId: STALLION.Id }], truncated: true },
        };
      }
      return { executed: true, result: { data: [STALLION], truncated: false } };
    });

    await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("work order read came back truncated");
    warn.mockRestore();
  });

  // Most of a real directory carries no expiration date at all. A missing date is not an
  // expiration inside the window, and must not be reported as one.
  it("leaves out vendors that have no liability expiration on file", async () => {
    const deps = makeDeps();
    deps.reportsHttp.request.mockResolvedValue({
      results: [{ ...AMBRIZ, liability_ins_expires: null }, APEX],
    });

    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(result.vendors).toEqual([]);
  });
});
