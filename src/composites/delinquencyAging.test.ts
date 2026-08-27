// ABOUTME: Tests the delinquency_aging composite's aggregation of AppFolio's own aging buckets
// ABOUTME: (00_to30/30_to60/60_to90/90_plus), minBalance filtering, and per-tenant flags.
import { describe, it, expect, vi } from "vitest";
import { delinquencyAging } from "./delinquencyAging";
import { runReport } from "../reports/tools";

const FIXTURE_ROWS = [
  { property_id: 1, property_name: "1228 Harrison Lane", property_address: "1228 Harrison Lane Hurst, TX 76053", occupancy_id: 501, name: "Alice Tenant", "00_to30": "100.00", "30_to60": "0.00", "60_to90": "0.00", "90_plus": "0.00", in_collections: "No", late: 1 },
  { property_id: 1, property_name: "1228 Harrison Lane", property_address: "1228 Harrison Lane Hurst, TX 76053", occupancy_id: 502, name: "Bob Tenant", "00_to30": "0.00", "30_to60": "0.00", "60_to90": "0.00", "90_plus": "600.00", in_collections: "Yes", late: 5 },
  { property_id: 2, property_name: "8430 Birchcroft", property_address: "8430 Birchcroft Drive Dallas, TX 75243", occupancy_id: 503, name: "Zero Balance Tenant", "00_to30": "0.00", "30_to60": "0.00", "60_to90": "0.00", "90_plus": "0.00", in_collections: "No", late: 0 },
];

// Shapes taken from real Perpetual Realty delinquency rows. Stowes Electric's buckets really do
// carry credits in the older buckets while the newer ones hold the balance, and property 321
// really does come back with a null property_name, only an address.
const CREDIT_ROW = {
  property_id: 253, property_name: "5755 Rufe Snow Drive", property_address: "5755 Rufe Snow Drive North Richland Hills, TX 76180",
  occupancy_id: 430, name: "Stowes Electric",
  "00_to30": "1650.00", "30_to60": "450.00", "60_to90": "0.00", "90_plus": "-1500.00", in_collections: "No", late: 7,
};

const UNNAMED_PROPERTY_ROW = {
  property_id: 321, property_name: null, property_address: "9602 Bill Browne Lane Dallas, TX 75243",
  occupancy_id: 541, name: "Beck, Janicia",
  "00_to30": "4078.50", "30_to60": "0.00", "60_to90": "0.00", "90_plus": "0.00", in_collections: "No", late: 2,
};

function makeHttp(rows: Record<string, unknown>[] = FIXTURE_ROWS) {
  return { request: vi.fn().mockResolvedValue({ results: rows }) };
}

describe("delinquencyAging", () => {
  it("aggregates AppFolio's own aging buckets rather than re-deriving them", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 0 });
    expect(result.totals.days0To30).toBeCloseTo(100, 5);
    expect(result.totals.days30To60).toBeCloseTo(0, 5);
    expect(result.totals.days60To90).toBeCloseTo(0, 5);
    expect(result.totals.days90Plus).toBeCloseTo(600, 5);
  });

  it("filters out tenants below the minimum balance", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 500 });
    expect(result.tenants).toHaveLength(1);
    expect(result.tenants[0].occupancyId).toBe("502");
  });

  it("excludes a zero-balance tenant from the tenant list even at minBalance 0", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 0 });
    expect(result.tenants.find((t) => t.occupancyId === "503")).toBeUndefined();
    // Its all-zero buckets still contribute (nothing) to the totals, they aren't dropped from aggregation.
    expect(result.totals.days0To30).toBeCloseTo(100, 5);
  });

  it("carries the collections and repeat-lateness flags through per tenant", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 0 });
    const bob = result.tenants.find((t) => t.occupancyId === "502");
    expect(bob).toMatchObject({ inCollections: true, lateCount: 5, tenantName: "Bob Tenant", propertyId: "1" });
    const alice = result.tenants.find((t) => t.occupancyId === "501");
    expect(alice).toMatchObject({ inCollections: false, lateCount: 1 });
  });

  it("filters to requested properties, server-side and client-side", async () => {
    const http = makeHttp();
    const result = await delinquencyAging(http, { minBalance: 0, properties: ["1"] });
    expect(result.tenants.every((t) => t.propertyId === "1")).toBe(true);
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/delinquency", {
      body: { filters: { properties: { properties_ids: ["1"] } } },
    });
  });

  it("reports truncated: false when the report returned every row", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 0 });
    expect(result.truncated).toBe(false);
  });

  it("reports truncated: true when the report hit its row cap, so totals are partial", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ ...FIXTURE_ROWS[0], occupancy_id: i }));
    const result = await delinquencyAging(makeHttp(rows), { minBalance: 0 });

    expect(result.truncated).toBe(true);
    expect(result.totals.days0To30).toBeCloseTo(500 * 100, 5);
  });

  it("names the property instead of leaving the caller with a bare id", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 0 });
    const alice = result.tenants.find((t) => t.occupancyId === "501");
    expect(alice).toMatchObject({
      propertyId: "1",
      propertyName: "1228 Harrison Lane",
      propertyAddress: "1228 Harrison Lane Hurst, TX 76053",
    });
  });

  it("still identifies a property AppFolio has no name for, by address", async () => {
    const result = await delinquencyAging(makeHttp([UNNAMED_PROPERTY_ROW]), { minBalance: 0 });
    expect(result.tenants[0]).toMatchObject({
      propertyId: "321",
      propertyName: "",
      propertyAddress: "9602 Bill Browne Lane Dallas, TX 75243",
    });
  });

  it("keeps credits in the totals so the buckets net to what is actually owed", async () => {
    const result = await delinquencyAging(makeHttp([CREDIT_ROW]), { minBalance: 0 });
    expect(result.totals.days0To30).toBeCloseTo(1650, 5);
    expect(result.totals.days30To60).toBeCloseTo(450, 5);
    expect(result.totals.days90Plus).toBeCloseTo(-1500, 5);

    const net = result.totals.days0To30 + result.totals.days30To60 + result.totals.days60To90 + result.totals.days90Plus;
    expect(net).toBeCloseTo(600, 5);
  });

  it("explains a negative bucket total rather than leaving it looking broken", async () => {
    const result = await delinquencyAging(makeHttp([CREDIT_ROW]), { minBalance: 0 });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("days90Plus");
    expect(result.notes[0]).toContain("oldest");
    expect(result.notes[0]).toContain("600.00");
  });

  it("adds no note when every bucket total is non-negative", async () => {
    const result = await delinquencyAging(makeHttp(), { minBalance: 0 });
    expect(result.notes).toEqual([]);
  });

  it("calls the real runReport gate for delinquency and no longer gets UnverifiedReportError", async () => {
    const http = makeHttp([]);
    await expect(runReport(http, "delinquency", {})).resolves.toEqual({
      rows: [],
      count: 0,
      truncated: false,
      nextPageUrl: undefined,
    });
  });
});
