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
      body: { filters: { liability_expiration_to: "2026-09-13" } },
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
});
