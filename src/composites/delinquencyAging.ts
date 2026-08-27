// ABOUTME: Sums the delinquency report's own aging buckets (00_to30/30_to60/60_to90/90_plus)
// ABOUTME: rather than re-deriving them, and surfaces collections/repeat-lateness flags per tenant.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

const COLUMNS = {
  propertyId: "property_id",
  propertyName: "property_name",
  propertyAddress: "property_address",
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
  // AppFolio leaves property_name null for plenty of real properties, so this is "" as often as
  // not. property_address is populated on every row, which makes it the label to lean on.
  propertyName: string;
  propertyAddress: string;
  balance: number;
  inCollections: boolean;
  lateCount: number;
}

export interface DelinquencyAgingResult {
  totals: AgingTotals;
  tenants: DelinquentTenant[];
  truncated: boolean;
  notes: string[];
}

function emptyTotals(): AgingTotals {
  return { days0To30: 0, days30To60: 0, days60To90: 0, days90Plus: 0 };
}

function parseCurrency(value: unknown): number {
  const num = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function isTruthyFlag(value: unknown): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return s !== "" && s !== "no" && s !== "false" && s !== "0";
}

export async function delinquencyAging(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { minBalance: number; properties?: string[] }
): Promise<DelinquencyAgingResult> {
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
      // The delinquency report already carries the property's name and address on every row, so
      // naming the property costs nothing. Returning the bare id forced callers into a second
      // property_directory lookup just to find out which building a balance belonged to.
      propertyName: text(row[COLUMNS.propertyName]),
      propertyAddress: text(row[COLUMNS.propertyAddress]),
      balance,
      inCollections: isTruthyFlag(row[COLUMNS.inCollections]),
      lateCount: Number(row[COLUMNS.lateCount]),
    });
  }

  // AppFolio applies a payment to the oldest charges first, so a tenant who pays ahead can end up
  // holding a credit in an older bucket while the newer buckets carry the real balance. Confirmed
  // live against a real commercial tenant whose row reads 00_to30 1650.00, 30_to60 450.00,
  // 90_plus -1500.00, and which nets to exactly the 600.00 AppFolio itself reports as that
  // tenant's amount_receivable. The buckets are right; only the presentation was wrong.
  //
  // So the totals keep summing every row, credits included. That net figure is the honest answer
  // to "how much am I owed", and dropping the credits into a separate line item would overstate
  // the receivable by money tenants have already paid. What actually misled callers was a bucket
  // surfacing as a bare negative number with nothing to explain it, which reads as a broken
  // calculation. The number stays and a note explains it instead.
  const notes: string[] = [];
  const negativeBuckets = (Object.keys(totals) as (keyof AgingTotals)[]).filter((b) => totals[b] < 0);
  if (negativeBuckets.length > 0) {
    const net = totals.days0To30 + totals.days30To60 + totals.days60To90 + totals.days90Plus;
    notes.push(
      `Aging buckets with a negative total: ${negativeBuckets.join(", ")}. That reflects AppFolio ` +
        `applying payments to the oldest charges first, which leaves a credit in an older bucket ` +
        `while newer buckets carry the real balance. It does not mean tenants are owed money. The ` +
        `buckets still net to ${net.toFixed(2)} owed across the rows counted here.`
    );
  }

  // The underlying report caps its rows, so a larger delinquency list would otherwise produce
  // confident totals computed from only part of it. Pass the flag through so callers can tell
  // a complete answer from a partial one.
  return { totals, tenants, truncated: report.truncated, notes };
}
