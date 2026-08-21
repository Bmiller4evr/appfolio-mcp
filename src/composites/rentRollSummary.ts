// ABOUTME: Occupancy (by unit count and square footage) and market-vs-actual rent gap,
// ABOUTME: rolled up per property and portfolio-wide, from the verified rent_roll report.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

const COLUMNS = {
  propertyId: "property_id",
  status: "status",
  sqft: "sqft",
  marketRent: "market_rent",
  rent: "rent",
} as const;

const OCCUPIED_STATUS = "occupied";

interface PropertyTotals {
  unitsOccupied: number;
  unitsVacant: number;
  squareFeetOccupied: number;
  squareFeetVacant: number;
  rentGap: number;
}

function emptyTotals(): PropertyTotals {
  return { unitsOccupied: 0, unitsVacant: 0, squareFeetOccupied: 0, squareFeetVacant: 0, rentGap: 0 };
}

function parseCurrency(value: unknown): number {
  const num = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function isOccupied(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === OCCUPIED_STATUS;
}

export async function rentRollSummary(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { asOf: string; properties?: string[] }
): Promise<{ portfolio: PropertyTotals; byProperty: Record<string, PropertyTotals>; truncated: boolean }> {
  const filters: Record<string, unknown> = { as_of_to: opts.asOf };
  if (opts.properties) filters.properties = { properties_ids: opts.properties };

  const report = await runReport(reportsHttp, "rent_roll", { filters });

  const portfolio = emptyTotals();
  const byProperty: Record<string, PropertyTotals> = {};
  if (opts.properties) {
    for (const id of opts.properties) byProperty[id] = emptyTotals();
  }

  for (const row of report.rows as Record<string, unknown>[]) {
    const propertyId = String(row[COLUMNS.propertyId]);
    if (opts.properties && !opts.properties.includes(propertyId)) continue;
    if (!byProperty[propertyId]) byProperty[propertyId] = emptyTotals();

    const occupied = isOccupied(row[COLUMNS.status]);
    const sqft = Number(row[COLUMNS.sqft]) || 0;
    const gap = occupied ? parseCurrency(row[COLUMNS.marketRent]) - parseCurrency(row[COLUMNS.rent]) : 0;

    for (const totals of [portfolio, byProperty[propertyId]]) {
      if (occupied) {
        totals.unitsOccupied += 1;
        totals.squareFeetOccupied += sqft;
        totals.rentGap += gap;
      } else {
        totals.unitsVacant += 1;
        totals.squareFeetVacant += sqft;
      }
    }
  }

  // The underlying report caps its rows, so a portfolio larger than that cap would otherwise
  // produce confident totals computed from only part of it. Pass the flag through so callers
  // can tell a complete answer from a partial one.
  return { portfolio, byProperty, truncated: report.truncated };
}
