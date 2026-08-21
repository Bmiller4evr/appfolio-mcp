// ABOUTME: Sums the delinquency report's own aging buckets (00_to30/30_to60/60_to90/90_plus)
// ABOUTME: rather than re-deriving them, and surfaces collections/repeat-lateness flags per tenant.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

const COLUMNS = {
  propertyId: "property_id",
  occupancyId: "occupancy_id",
  tenantName: "name",
  days0To30: "00_to30",
  days30To60: "30_to60",
  days60To90: "60_to90",
  days90Plus: "90_plus",
  inCollections: "in_collections",
  lateCount: "late",
} as const;

interface AgingTotals {
  days0To30: number;
  days30To60: number;
  days60To90: number;
  days90Plus: number;
}

export interface DelinquentTenant {
  occupancyId: string;
  tenantName: string;
  propertyId: string;
  balance: number;
  inCollections: boolean;
  lateCount: number;
}

function emptyTotals(): AgingTotals {
  return { days0To30: 0, days30To60: 0, days60To90: 0, days90Plus: 0 };
}

function parseCurrency(value: unknown): number {
  const num = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function isTruthyFlag(value: unknown): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return s !== "" && s !== "no" && s !== "false" && s !== "0";
}

export async function delinquencyAging(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { minBalance: number; properties?: string[] }
): Promise<{ totals: AgingTotals; tenants: DelinquentTenant[]; truncated: boolean }> {
  const filters: Record<string, unknown> = {};
  if (opts.properties) filters.properties = { properties_ids: opts.properties };

  const report = await runReport(reportsHttp, "delinquency", { filters });

  const totals = emptyTotals();
  const tenants: DelinquentTenant[] = [];

  for (const row of report.rows as Record<string, unknown>[]) {
    const propertyId = String(row[COLUMNS.propertyId]);
    if (opts.properties && !opts.properties.includes(propertyId)) continue;

    const days0To30 = parseCurrency(row[COLUMNS.days0To30]);
    const days30To60 = parseCurrency(row[COLUMNS.days30To60]);
    const days60To90 = parseCurrency(row[COLUMNS.days60To90]);
    const days90Plus = parseCurrency(row[COLUMNS.days90Plus]);

    totals.days0To30 += days0To30;
    totals.days30To60 += days30To60;
    totals.days60To90 += days60To90;
    totals.days90Plus += days90Plus;

    const balance = days0To30 + days30To60 + days60To90 + days90Plus;
    if (balance <= opts.minBalance) continue;

    tenants.push({
      occupancyId: String(row[COLUMNS.occupancyId]),
      tenantName: String(row[COLUMNS.tenantName]),
      propertyId,
      balance,
      inCollections: isTruthyFlag(row[COLUMNS.inCollections]),
      lateCount: Number(row[COLUMNS.lateCount]),
    });
  }

  // The underlying report caps its rows, so a larger delinquency list would otherwise produce
  // confident totals computed from only part of it. Pass the flag through so callers can tell
  // a complete answer from a partial one.
  return { totals, tenants, truncated: report.truncated };
}
