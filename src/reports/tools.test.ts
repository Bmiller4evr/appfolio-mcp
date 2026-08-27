// ABOUTME: Tests the reports catalog and execution tools, verified vs unverified reports,
// ABOUTME: column-scoped queries, truncation and pagination signal.
import { describe, it, expect, vi } from "vitest";
import { listReports, describeReport, runReport, UnverifiedReportError, NotFoundError } from "./tools";
import type { ReportDescriptor } from "./operations.data";

describe("listReports", () => {
  it("lists all reports, flagging which are verified", () => {
    const results = listReports();
    expect(results.find((r) => r.id === "vendor_directory")?.verified).toBe(true);
    expect(results.find((r) => r.id === "work_order")?.verified).toBe(true);
  });

  it("filters by search text", () => {
    expect(listReports("vendor_directory").map((r) => r.id)).toEqual(["vendor_directory"]);
    const vendorish = listReports("vendor").map((r) => r.id);
    expect(vendorish).toContain("vendor_directory");
    expect(vendorish).toContain("vendor_ledger");
    expect(vendorish).not.toContain("balance_sheet");
  });

  it("lists the reports ingested from CryptoCultCurt and from live verification", () => {
    const ids = listReports().map((r) => r.id);
    expect(ids).toContain("balance_sheet");
    expect(ids).toContain("tenant_directory");
    expect(ids).toContain("in_progress_workflows");
  });

  it("omits screening_assessment, which is not a real report id for this account", () => {
    expect(listReports().map((r) => r.id)).not.toContain("screening_assessment");
  });
});

describe("describeReport", () => {
  it("returns full column/filter detail for a verified report", () => {
    const report = describeReport("vendor_directory");
    expect(report.columns.map((c) => c.name)).toContain("liability_ins_expires");
  });

  it("returns verified columns for a report sourced from CryptoCultCurt", () => {
    const report = describeReport("balance_sheet");
    expect(report.verified).toBe(true);
    expect(report.source).toBe("cryptocultcurt-v2 (ISC, attributed)");
    expect(report.columns).toEqual([
      { name: "account_name", type: "string" },
      { name: "balance", type: "number" },
      { name: "account_number", type: "string" },
    ]);
    expect(report.filters.map((f) => f.name)).toContain("properties.property_groups_ids");
  });

  it("returns live-verified columns for the reports CryptoCultCurt got wrong", () => {
    const report = describeReport("tenant_directory");
    expect(report.verified).toBe(true);
    expect(report.source).toBe("live-verified against Perpetual Realty account, 2026-08-25");
    expect(report.columns.map((c) => c.name)).toContain("tenant_portal_activated");
  });

  it("warns about filters AppFolio accepts but never applies", () => {
    expect(describeReport("leasing_funnel_performance").filterCaveats).toMatch(/date_from and date_to/);
    expect(describeReport("lease_expiration_detail").filterCaveats).toMatch(/never applied/);
    expect(describeReport("work_order").filterCaveats).toMatch(/numeric status ids/);
  });

  it("names the rental application status filter the one AppFolio actually reads", () => {
    const report = describeReport("rental_applications");
    expect(report.filters.map((f) => f.name)).toContain("rental_application_statuses");
    expect(report.filters.map((f) => f.name)).not.toContain("statuses");
  });

  it("leaves filterCaveats unset on reports whose filters were confirmed working", () => {
    expect(describeReport("rent_roll").filterCaveats).toBeUndefined();
    expect(describeReport("vendor_directory").filterCaveats).toBeUndefined();
  });

  it("throws NotFoundError for an unknown report", () => {
    expect(() => describeReport("nope")).toThrow(NotFoundError);
  });

  it("throws NotFoundError for screening_assessment, confirmed not to be a real report", () => {
    expect(() => describeReport("screening_assessment")).toThrow(NotFoundError);
  });
});

describe("runReport", () => {
  it("executes a verified report and returns rows", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [{ vendor_type: "Plumbing" }] }) };
    const result = await runReport(http, "vendor_directory", { filters: { liability_expiration_to: "2026-09-13" } });
    expect(result).toEqual({ rows: [{ vendor_type: "Plumbing" }], count: 1, truncated: false, nextPageUrl: undefined });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/vendor_directory", {
      body: { liability_expiration_to: "2026-09-13" },
    });
  });

  // Confirmed live against a real account: AppFolio's V2 report endpoints read each filter as a
  // top-level key of the POST body. A `filters` envelope is answered with 200 and ignored, so a
  // wrapped filter reaches the report as no filter at all. rent_roll scoped to one property
  // returned 1 row sent top-level and all 230 rows sent wrapped, byte-identical to no filter.
  it("sends each filter as a top-level body key, since AppFolio ignores a filters envelope", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [] }) };
    await runReport(http, "rent_roll", { filters: { as_of_to: "2020-01-01" } });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", {
      body: { as_of_to: "2020-01-01" },
    });
  });

  it("omits the filters key entirely when no filters were given", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [] }) };
    await runReport(http, "rent_roll", {});
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", { body: {} });
  });

  // The catalog spells nested filters as dotted paths (properties.properties_ids), which is the
  // name describe_report hands a caller. AppFolio only honours the expanded object: sent as the
  // literal dotted key, rent_roll returned all 230 rows; expanded, it returned 1.
  it("expands the catalog's dotted filter names into the nested objects AppFolio expects", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [] }) };
    await runReport(http, "rent_roll", { filters: { "properties.properties_ids": ["269"] } });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", {
      body: { properties: { properties_ids: ["269"] } },
    });
  });

  it("merges sibling dotted filters that share a prefix into one object", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [] }) };
    await runReport(http, "rent_roll", {
      filters: { "properties.properties_ids": ["269"], "properties.owners_ids": ["4"], as_of_to: "2026-08-25" },
    });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", {
      body: { properties: { properties_ids: ["269"], owners_ids: ["4"] }, as_of_to: "2026-08-25" },
    });
  });

  it("passes an already-nested filter object through unchanged", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [] }) };
    await runReport(http, "rent_roll", { filters: { properties: { properties_ids: ["269"] } } });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", {
      body: { properties: { properties_ids: ["269"] } },
    });
  });

  it("sends columns alongside the top-level filters", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [] }) };
    await runReport(http, "rent_roll", { filters: { as_of_to: "2026-08-25" }, columns: ["unit", "rent"] });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", {
      body: { as_of_to: "2026-08-25", columns: ["unit", "rent"] },
    });
  });

  it("truncates to maxRows and reports truncation", async () => {
    const http = { request: vi.fn().mockResolvedValue({ results: [{ id: 1 }, { id: 2 }, { id: 3 }] }) };
    const result = await runReport(http, "vendor_directory", { maxRows: 2 });
    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("refuses to run an unverified report rather than guess at its columns", async () => {
    const http = { request: vi.fn() };
    const unverifiedReport: ReportDescriptor = {
      id: "fixture_unverified",
      title: "Fixture Unverified Report",
      summary: "A synthetic descriptor, standing in for whatever report is unverified at any point in time.",
      tags: [],
      verified: false,
      columns: [],
      filters: [],
    };
    await expect(runReport(http, "fixture_unverified", {}, () => unverifiedReport)).rejects.toThrow(
      UnverifiedReportError
    );
    expect(http.request).not.toHaveBeenCalled();
  });

  it("handles reports whose V2 endpoint returns a raw array instead of { results }", async () => {
    // Confirmed live against a real account: balance_sheet, cash_flow_detail, and several other
    // financial reports return a bare JSON array as the whole response body, not { results }.
    // A caller has no way to know which shape a given report id will use ahead of time.
    const http = { request: vi.fn().mockResolvedValue([{ account_name: "Cash", balance: "100.00" }]) };
    const result = await runReport(http, "balance_sheet", { filters: { posted_on_to: "2026-08-24" } });
    expect(result).toEqual({
      rows: [{ account_name: "Cash", balance: "100.00" }],
      count: 1,
      truncated: false,
      nextPageUrl: undefined,
    });
  });

  it("truncates a raw-array response to maxRows and reports truncation", async () => {
    const http = { request: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]) };
    const result = await runReport(http, "balance_sheet", { maxRows: 2 });
    expect(result.count).toBe(2);
    expect(result.truncated).toBe(true);
  });
});
