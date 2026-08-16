// ABOUTME: Age-in-days buckets for work orders plus two stall signals the raw report won't
// ABOUTME: volunteer on its own, grouped by property, vendor, and priority.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";

const COLUMNS = {
  propertyId: "property_id",
  vendorId: "vendor_id",
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

export interface AgedWorkOrder {
  propertyId: string;
  vendorId: string;
  priority: string;
  ageDays: number;
  stalled: string[];
}

export interface WorkOrderAgingResult {
  workOrders: AgedWorkOrder[];
  byProperty: Record<string, AgedWorkOrder[]>;
  byVendor: Record<string, AgedWorkOrder[]>;
  byPriority: Record<string, AgedWorkOrder[]>;
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
      vendorId: String(row[COLUMNS.vendorId]),
      priority: String(row[COLUMNS.priority]),
      ageDays: daysBetween(row[COLUMNS.createdAt] as string, opts.asOf),
      stalled,
    };

    workOrders.push(entry);
    (byProperty[entry.propertyId] ??= []).push(entry);
    (byVendor[entry.vendorId] ??= []).push(entry);
    (byPriority[entry.priority] ??= []).push(entry);
  }

  return { workOrders, byProperty, byVendor, byPriority, truncated: report.truncated };
}
