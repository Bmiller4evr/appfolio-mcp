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
    expect(listReports("vendor").map((r) => r.id)).toEqual(["vendor_directory"]);
  });
});

describe("describeReport", () => {
  it("returns full column/filter detail for a verified report", () => {
    const report = describeReport("vendor_directory");
    expect(report.columns.map((c) => c.name)).toContain("liability_ins_expires");
  });

  it("throws NotFoundError for an unknown report", () => {
    expect(() => describeReport("nope")).toThrow(NotFoundError);
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
