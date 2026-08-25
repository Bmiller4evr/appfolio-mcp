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
    // The Database API v0 shape, as returned live: a { data: [...] } envelope, PascalCase fields,
    // and a next_page_path that is null once the results fit on a single page.
    callEndpoint: vi.fn().mockResolvedValue({
      executed: true,
      result: {
        data: [
          { VendorId: "v1", PropertyId: "p100" },
          { VendorId: "v1", PropertyId: "p200" },
        ],
        next_page_path: null,
      },
    }),
    // Only `http` is real to this unit test: vendorCompliance forwards the whole object to
    // callEndpoint (itself mocked above) and reaches into `http` for follow-up pages. Route
    // assembly (Task 16) provides the real CallEndpointDeps.
    callEndpointDeps: { http: { request: vi.fn() } } as any,
  };
}

describe("vendorCompliance", () => {
  it("filters vendors whose insurance expires within the window and attributes them to properties", async () => {
    const deps = makeDeps();
    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0]).toMatchObject({ id: "v1", vendorType: "Plumbing", properties: ["p100", "p200"] });
    // next_page_path absent on the only page, so there is nothing to follow.
    expect(deps.callEndpointDeps.http.request).not.toHaveBeenCalled();
  });

  // A real portfolio's ten-year work order history runs past one page. AppFolio hands back the
  // rest through next_page_path, and callEndpoint cannot follow it (it builds the request path
  // from the operation's own fixed path template), so anything past page 1 reaches the composite
  // only if it follows that path through the HTTP client itself.
  it("aggregates work orders across every page of the results, not just the first", async () => {
    const deps = makeDeps();
    deps.reportsHttp.request.mockResolvedValue({
      results: [
        { id: "v1", vendor_type: "Plumbing", liability_ins_expires: "2026-09-01", workers_comp_expires: "2027-01-01" },
        { id: "v3", vendor_type: "Roofing", liability_ins_expires: "2026-08-20", workers_comp_expires: "2027-01-01" },
      ],
    });
    deps.callEndpoint.mockResolvedValue({
      executed: true,
      result: {
        data: [{ VendorId: "v1", PropertyId: "p100" }],
        next_page_path: "/api/v0/work_orders?page[number]=2",
      },
    });
    deps.callEndpointDeps.http.request.mockResolvedValue({
      data: [
        { VendorId: "v1", PropertyId: "p200" },
        { VendorId: "v3", PropertyId: "p300" },
      ],
      next_page_path: null,
    });

    const result = await vendorCompliance(deps, { role: "owner" }, { withinDays: 30, asOf: "2026-08-13" });

    // v3's only work order lives on page 2: a single-page fetch attributes it to no property at all.
    const v3 = result.vendors.find((v) => v.id === "v3");
    expect(v3?.properties).toEqual(["p300"]);
    // v1's properties span the page boundary, so neither page alone produces this set.
    const v1 = result.vendors.find((v) => v.id === "v1");
    expect(v1?.properties).toEqual(["p100", "p200"]);

    // next_page_path repeats the /api/v0 prefix the HTTP client's base URL already carries.
    expect(deps.callEndpointDeps.http.request).toHaveBeenCalledTimes(1);
    expect(deps.callEndpointDeps.http.request).toHaveBeenCalledWith("GET", "/work_orders?page[number]=2", {});
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
});
