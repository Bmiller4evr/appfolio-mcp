// ABOUTME: Tests the rent_roll_summary composite's occupancy and rent-gap aggregation, using
// ABOUTME: rent_roll's verified V2 columns (property_id, sqft, status, market_rent, rent).
import { describe, it, expect, vi } from "vitest";
import { rentRollSummary } from "./rentRollSummary";
import { runReport } from "../reports/tools";

// Statuses here are the ones AppFolio's rent_roll actually returns, confirmed against a live
// account: Current, Vacant-Rented, Vacant-Unrented, Notice-Rented, Notice-Unrented.
const FIXTURE_ROWS = [
  { property_id: 1, unit_id: 101, sqft: 800, status: "Current", market_rent: "1500.00", rent: "1450.00" },
  { property_id: 1, unit_id: 102, sqft: 950, status: "Vacant-Unrented", market_rent: "1700.00", rent: null },
  { property_id: 2, unit_id: 201, sqft: 600, status: "Notice-Unrented", market_rent: "1200.00", rent: "1100.00" },
];

function makeHttp(rows: Record<string, unknown>[] = FIXTURE_ROWS) {
  return { request: vi.fn().mockResolvedValue({ results: rows }) };
}

describe("rentRollSummary", () => {
  it("computes occupancy by unit count and by square footage", async () => {
    const result = await rentRollSummary(makeHttp(), { asOf: "2026-08-13" });

    expect(result.portfolio.unitsOccupied).toBe(2);
    expect(result.portfolio.unitsVacant).toBe(1);
    expect(result.portfolio.squareFeetOccupied).toBe(1400);
    expect(result.portfolio.squareFeetVacant).toBe(950);
  });

  it("computes the market-vs-actual rent gap for occupied units only", async () => {
    const result = await rentRollSummary(makeHttp(), { asOf: "2026-08-13" });
    // (1500-1450) + (1200-1100) = 150; the vacant unit contributes nothing.
    expect(result.portfolio.rentGap).toBeCloseTo(150, 5);
  });

  it("counts a unit under notice to vacate as occupied and a re-leased vacant unit as vacant", async () => {
    const rows = [
      { property_id: 1, unit_id: 101, sqft: 100, status: "Current", market_rent: "1000.00", rent: "1000.00" },
      { property_id: 1, unit_id: 102, sqft: 100, status: "Notice-Rented", market_rent: "1000.00", rent: "900.00" },
      { property_id: 1, unit_id: 103, sqft: 100, status: "Notice-Unrented", market_rent: "1000.00", rent: "800.00" },
      { property_id: 1, unit_id: 104, sqft: 100, status: "Vacant-Rented", market_rent: "1000.00", rent: null },
      { property_id: 1, unit_id: 105, sqft: 100, status: "Vacant-Unrented", market_rent: "1000.00", rent: null },
    ];
    const result = await rentRollSummary(makeHttp(rows), { asOf: "2026-08-13" });

    expect(result.portfolio.unitsOccupied).toBe(3);
    expect(result.portfolio.unitsVacant).toBe(2);
    // Only the three rent-paying units contribute a gap: 0 + 100 + 200.
    expect(result.portfolio.rentGap).toBeCloseTo(300, 5);
  });

  it("treats status case-insensitively and tolerates surrounding whitespace", async () => {
    const rows = [
      { property_id: 1, unit_id: 101, sqft: 100, status: "  current  ", market_rent: "1000.00", rent: "1000.00" },
      { property_id: 1, unit_id: 102, sqft: 100, status: "VACANT-UNRENTED", market_rent: "1000.00", rent: null },
    ];
    const result = await rentRollSummary(makeHttp(rows), { asOf: "2026-08-13" });

    expect(result.portfolio.unitsOccupied).toBe(1);
    expect(result.portfolio.unitsVacant).toBe(1);
  });

  it("does not report a fully vacant portfolio for a realistic mix of AppFolio statuses", async () => {
    // The live distribution for a real 230-unit account: comparing status against the literal
    // string "occupied" classified every one of these units as vacant.
    const distribution = {
      Current: 190,
      "Vacant-Rented": 2,
      "Vacant-Unrented": 36,
      "Notice-Rented": 1,
      "Notice-Unrented": 1,
    };
    const rows = Object.entries(distribution).flatMap(([status, count]) =>
      Array.from({ length: count }, (_, i) => ({
        property_id: 1,
        unit_id: `${status}-${i}`,
        sqft: 100,
        status,
        market_rent: "1000.00",
        rent: status.startsWith("Vacant") ? null : "1000.00",
      }))
    );

    const result = await rentRollSummary(makeHttp(rows), { asOf: "2026-08-13" });

    expect(result.portfolio.unitsOccupied).toBe(192);
    expect(result.portfolio.unitsVacant).toBe(38);
    expect(result.portfolio.squareFeetOccupied).toBe(19200);
    expect(result.portfolio.squareFeetVacant).toBe(3800);
  });

  it("throws on a status outside AppFolio's vocabulary instead of counting the unit vacant", async () => {
    const rows = [{ property_id: 1, unit_id: 101, sqft: 100, status: "Occupied", market_rent: "1000.00", rent: "1000.00" }];

    await expect(rentRollSummary(makeHttp(rows), { asOf: "2026-08-13" })).rejects.toThrow(/Occupied/);
  });

  it("rolls up per property", async () => {
    const result = await rentRollSummary(makeHttp(), { asOf: "2026-08-13" });
    expect(result.byProperty["1"]).toEqual({
      unitsOccupied: 1,
      unitsVacant: 1,
      squareFeetOccupied: 800,
      squareFeetVacant: 950,
      rentGap: 50,
    });
    expect(result.byProperty["2"]).toEqual({
      unitsOccupied: 1,
      unitsVacant: 0,
      squareFeetOccupied: 600,
      squareFeetVacant: 0,
      rentGap: 100,
    });
  });

  it("filters to requested properties and still reports a property with zero rows", async () => {
    const result = await rentRollSummary(makeHttp(), { asOf: "2026-08-13", properties: ["1", "999"] });

    expect(Object.keys(result.byProperty).sort()).toEqual(["1", "999"]);
    expect(result.byProperty["999"]).toEqual({
      unitsOccupied: 0,
      unitsVacant: 0,
      squareFeetOccupied: 0,
      squareFeetVacant: 0,
      rentGap: 0,
    });
    expect(result.portfolio.unitsOccupied).toBe(1);
  });

  it("sends as_of_to and the properties filter to the rent_roll report", async () => {
    const http = makeHttp();
    await rentRollSummary(http, { asOf: "2026-08-13", properties: ["1"] });
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/rent_roll", {
      body: { filters: { as_of_to: "2026-08-13", properties: { properties_ids: ["1"] } } },
    });
  });

  it("reports truncated: false when the report returned every row", async () => {
    const result = await rentRollSummary(makeHttp(), { asOf: "2026-08-13" });
    expect(result.truncated).toBe(false);
  });

  it("reports truncated: true when the report hit its row cap, so totals are partial", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      ...FIXTURE_ROWS[0],
      unit_id: i,
    }));
    const result = await rentRollSummary(makeHttp(rows), { asOf: "2026-08-13" });

    expect(result.truncated).toBe(true);
    expect(result.portfolio.unitsOccupied).toBe(500);
  });

  it("calls the real runReport gate for rent_roll and no longer gets UnverifiedReportError", async () => {
    const http = makeHttp([]);
    await expect(runReport(http, "rent_roll", { filters: { as_of_to: "2026-08-13" } })).resolves.toEqual({
      rows: [],
      count: 0,
      truncated: false,
      nextPageUrl: undefined,
    });
  });
});
