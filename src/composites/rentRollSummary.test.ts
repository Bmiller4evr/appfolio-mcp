// ABOUTME: Tests the rent_roll_summary composite's occupancy and rent-gap aggregation, using
// ABOUTME: rent_roll's verified V2 columns (property_id, sqft, status, market_rent, rent).
import { describe, it, expect, vi } from "vitest";
import { rentRollSummary } from "./rentRollSummary";
import { runReport } from "../reports/tools";

const FIXTURE_ROWS = [
  { property_id: 1, unit_id: 101, sqft: 800, status: "Occupied", market_rent: "1500.00", rent: "1450.00" },
  { property_id: 1, unit_id: 102, sqft: 950, status: "Vacant", market_rent: "1700.00", rent: "0.00" },
  { property_id: 2, unit_id: 201, sqft: 600, status: "OCCUPIED", market_rent: "1200.00", rent: "1100.00" },
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

  it("treats status case-insensitively when deciding occupancy", async () => {
    const result = await rentRollSummary(makeHttp(), { asOf: "2026-08-13" });
    expect(result.byProperty["2"].unitsOccupied).toBe(1);
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
