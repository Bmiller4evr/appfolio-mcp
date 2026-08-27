// ABOUTME: Age-in-days buckets for work orders plus two stall signals the raw report won't
// ABOUTME: volunteer on its own, grouped by property, vendor, and priority.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

const COLUMNS = {
  propertyId: "property_id",
  propertyName: "property_name",
  propertyAddress: "property_address",
  property: "property",
  vendorId: "vendor_id",
  vendorName: "vendor",
  priority: "priority",
  status: "status",
  createdAt: "created_at",
  scheduledStart: "scheduled_start",
  completedOn: "completed_on",
  estimateRequestedOn: "estimate_req_on",
  estimatedOn: "estimated_on",
} as const;

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

// An absent column has to stay absent all the way out to the caller. Stringifying it turns a
// missing property or vendor into the four-character name "null", which reads like real data.
function firstPopulated(...values: unknown[]): string | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return null;
}

export interface AgedWorkOrder {
  propertyId: string;
  propertyName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  priority: string;
  ageDays: number;
  stalled: string[];
}

export interface WorkOrderAgingResult {
  workOrders: AgedWorkOrder[];
  byProperty: Record<string, AgedWorkOrder[]>;
  byVendor: Record<string, AgedWorkOrder[]>;
  byPriority: Record<string, AgedWorkOrder[]>;
  // Work orders nobody has been assigned to yet. They are kept out of byVendor because that
  // grouping answers "which vendor has the biggest backlog", and a bucket of unassigned tickets
  // is not a vendor's backlog: live it was the largest bucket of all, so it topped the ranking
  // under a made-up vendor name. They still need somewhere to live, since an unassigned pile is
  // its own signal and dropping it would leave byVendor silently short of workOrders.
  unassigned: AgedWorkOrder[];
  // True when the underlying report hit its row cap, so these groupings cover only part of
  // the open work orders and any count drawn from them is a floor, not a total.
  truncated: boolean;
}

export async function workOrderAging(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  opts: { asOf: string; properties?: string[]; status?: string }
): Promise<WorkOrderAgingResult> {
  const report = await runReport(reportsHttp, "work_order", {});

  const workOrders: AgedWorkOrder[] = [];
  const byProperty: Record<string, AgedWorkOrder[]> = {};
  const byVendor: Record<string, AgedWorkOrder[]> = {};
  const byPriority: Record<string, AgedWorkOrder[]> = {};
  const unassigned: AgedWorkOrder[] = [];

  for (const row of report.rows as Record<string, unknown>[]) {
    const propertyId = String(row[COLUMNS.propertyId]);
    if (opts.properties && !opts.properties.includes(propertyId)) continue;
    if (opts.status && row[COLUMNS.status] !== opts.status) continue;

    const completedOn = row[COLUMNS.completedOn];
    const scheduledStart = row[COLUMNS.scheduledStart];
    const estimateRequestedOn = row[COLUMNS.estimateRequestedOn];
    const estimatedOn = row[COLUMNS.estimatedOn];

    const stalled: string[] = [];
    if (!completedOn) {
      if (scheduledStart && new Date(scheduledStart as string) < new Date(opts.asOf)) {
        stalled.push("scheduled_start_passed");
      }
      if (estimateRequestedOn && !estimatedOn && new Date(estimateRequestedOn as string) < new Date(opts.asOf)) {
        stalled.push("estimate_overdue");
      }
    }

    const entry: AgedWorkOrder = {
      propertyId,
      // A property with no name of its own still names itself by its address on the same row.
      propertyName: firstPopulated(
        row[COLUMNS.propertyName],
        row[COLUMNS.propertyAddress],
        row[COLUMNS.property]
      ),
      vendorId: firstPopulated(row[COLUMNS.vendorId]),
      vendorName: firstPopulated(row[COLUMNS.vendorName]),
      priority: String(row[COLUMNS.priority]),
      ageDays: daysBetween(row[COLUMNS.createdAt] as string, opts.asOf),
      stalled,
    };

    workOrders.push(entry);
    (byProperty[entry.propertyId] ??= []).push(entry);
    (byPriority[entry.priority] ??= []).push(entry);

    // A named vendor with no id of its own is still a vendor, so key it by name rather than
    // letting every id-less row collapse into one bucket.
    const vendorKey = entry.vendorId ?? entry.vendorName;
    if (vendorKey === null) unassigned.push(entry);
    else (byVendor[vendorKey] ??= []).push(entry);
  }

  return { workOrders, byProperty, byVendor, byPriority, unassigned, truncated: report.truncated };
}
