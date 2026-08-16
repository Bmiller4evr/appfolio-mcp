// ABOUTME: Tests work_order_aging's age-in-days bucketing and its two stall signals
// ABOUTME: (scheduled_start_passed, estimate_overdue), grouped by property/vendor/priority.
import { describe, it, expect, vi } from "vitest";
import { workOrderAging } from "./workOrderAging";
import { runReport } from "../reports/tools";

const BASE_ROW = {
  property_id: "p1",
  vendor_id: "v1",
  priority: "High",
  status: "Open",
  created_at: "2026-07-01",
  scheduled_start: "2026-07-15",
  completed_on: null,
  estimate_req_on: "2026-07-02",
  estimated_on: null,
};

function makeHttp(rows: Record<string, unknown>[]) {
  return { request: vi.fn().mockResolvedValue({ results: rows }) };
}

describe("workOrderAging", () => {
  it("buckets open work orders by age from created_at", async () => {
    const result = await workOrderAging(makeHttp([BASE_ROW]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].ageDays).toBe(43);
  });

  it("flags a scheduled start in the past with no completion as stalled", async () => {
    const result = await workOrderAging(makeHttp([BASE_ROW]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).toContain("scheduled_start_passed");
  });

  it("flags an estimate requested with no estimate received as stalled", async () => {
    const result = await workOrderAging(makeHttp([BASE_ROW]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).toContain("estimate_overdue");
  });

  it("groups by property, vendor, and priority", async () => {
    const result = await workOrderAging(makeHttp([BASE_ROW]), { asOf: "2026-08-13" });
    expect(result.byProperty.p1).toHaveLength(1);
    expect(result.byVendor.v1).toHaveLength(1);
    expect(result.byPriority.High).toHaveLength(1);
  });

  it("does not flag scheduled_start_passed when scheduled_start is not yet set", async () => {
    const row = { ...BASE_ROW, scheduled_start: null };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).not.toContain("scheduled_start_passed");
  });

  it("does not flag estimate_overdue when no estimate was ever requested", async () => {
    const row = { ...BASE_ROW, estimate_req_on: null };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).not.toContain("estimate_overdue");
  });

  it("suppresses both stall signals once the work order is completed", async () => {
    const row = { ...BASE_ROW, completed_on: "2026-07-20" };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).toEqual([]);
  });

  it("does not flag a scheduled start that has not passed yet as of the given date", async () => {
    const row = { ...BASE_ROW, scheduled_start: "2026-09-01" };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).not.toContain("scheduled_start_passed");
  });

  it("does not flag estimate_overdue when estimate_req_on is not yet due as of the given date", async () => {
    const row = { ...BASE_ROW, estimate_req_on: "2026-09-01" };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].stalled).not.toContain("estimate_overdue");
  });

  it("filters to requested properties and status client-side", async () => {
    const rows = [
      BASE_ROW,
      { ...BASE_ROW, property_id: "p2", vendor_id: "v2", status: "Closed" },
    ];
    const result = await workOrderAging(makeHttp(rows), {
      asOf: "2026-08-13",
      properties: ["p1"],
      status: "Open",
    });
    expect(result.workOrders).toHaveLength(1);
    expect(result.workOrders[0].propertyId).toBe("p1");
  });

  it("calls the real runReport gate for work_order and no longer gets UnverifiedReportError", async () => {
    const http = makeHttp([]);
    await expect(runReport(http, "work_order", {})).resolves.toEqual({
      rows: [],
      count: 0,
      truncated: false,
      nextPageUrl: undefined,
    });
  });
});
