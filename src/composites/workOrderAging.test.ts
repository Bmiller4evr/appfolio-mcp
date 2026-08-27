// ABOUTME: Tests work_order_aging's age-in-days bucketing and its two stall signals
// ABOUTME: (scheduled_start_passed, estimate_overdue), grouped by property/vendor/priority.
import { describe, it, expect, vi } from "vitest";
import { workOrderAging } from "./workOrderAging";
import { runReport } from "../reports/tools";

const BASE_ROW = {
  property_id: "p1",
  property_name: "1729 Mariposa Dr",
  vendor_id: "v1",
  vendor: "Tucker, Matt",
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

  it("returns property and vendor names alongside their ids, since the report row already carries both", async () => {
    // A caller who only has propertyId/vendorId from this tool's output otherwise has to run a
    // separate lookup to find out which property or vendor a number refers to, even though the
    // underlying work_order report already returns property_name and vendor as columns.
    const result = await workOrderAging(makeHttp([BASE_ROW]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].propertyName).toBe("1729 Mariposa Dr");
    expect(result.workOrders[0].vendorName).toBe("Tucker, Matt");
  });

  it("falls back to the property address when the row carries no property name", async () => {
    // Live against Perpetual Realty, 12 of 41 work order rows come back with property_name: null
    // while property_address and property on the SAME row hold the address.
    const row = {
      ...BASE_ROW,
      property_name: null,
      property_address: "2720 ANSLEY Court Euless, TX 76039",
      property: "2720 ANSLEY Court Euless, TX 76039",
    };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].propertyName).toBe("2720 ANSLEY Court Euless, TX 76039");
  });

  it("falls back to the combined property label when name and address are both empty", async () => {
    const row = {
      ...BASE_ROW,
      property_name: null,
      property_address: null,
      property: "1714 Magnolia Lane - 1714 Magnolia Lane Euless, TX 76039",
    };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].propertyName).toBe("1714 Magnolia Lane - 1714 Magnolia Lane Euless, TX 76039");
  });

  it("reports a property with no label at all as null, never as the string 'null'", async () => {
    const row = { ...BASE_ROW, property_name: null, property_address: null, property: null };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].propertyName).toBeNull();
  });

  it("reports a work order with no vendor assigned as null, never as the string 'null'", async () => {
    const row = { ...BASE_ROW, vendor_id: null, vendor: null };
    const result = await workOrderAging(makeHttp([row]), { asOf: "2026-08-13" });
    expect(result.workOrders[0].vendorId).toBeNull();
    expect(result.workOrders[0].vendorName).toBeNull();
  });

  it("keeps work orders with no vendor out of byVendor so they cannot outrank a real vendor", async () => {
    // Live, the unassigned pile was the single biggest byVendor bucket, so "which vendor has the
    // biggest backlog" answered with a vendor named "null" holding 9 tickets.
    const rows = [
      BASE_ROW,
      ...Array.from({ length: 5 }, () => ({ ...BASE_ROW, vendor_id: null, vendor: null })),
    ];
    const result = await workOrderAging(makeHttp(rows), { asOf: "2026-08-13" });

    expect(Object.keys(result.byVendor)).toEqual(["v1"]);
    expect(result.unassigned).toHaveLength(5);
  });

  it("groups a vendor that has a name but no id under its name, not with the unassigned pile", async () => {
    // Live, Perpetual Property Management comes back with vendor: set and vendor_id: null.
    const rows = [
      { ...BASE_ROW, vendor_id: null, vendor: "Perpetual Property Management" },
      { ...BASE_ROW, vendor_id: null, vendor: null },
    ];
    const result = await workOrderAging(makeHttp(rows), { asOf: "2026-08-13" });

    expect(result.byVendor["Perpetual Property Management"]).toHaveLength(1);
    expect(result.unassigned).toHaveLength(1);
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

  it("reports truncated: false when the report returned every row", async () => {
    const result = await workOrderAging(makeHttp([BASE_ROW]), { asOf: "2026-08-13" });
    expect(result.truncated).toBe(false);
  });

  it("reports truncated: true when the report hit its row cap, so the groupings are partial", async () => {
    const rows = Array.from({ length: 501 }, () => ({ ...BASE_ROW }));
    const result = await workOrderAging(makeHttp(rows), { asOf: "2026-08-13" });

    expect(result.truncated).toBe(true);
    expect(result.workOrders).toHaveLength(500);
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
