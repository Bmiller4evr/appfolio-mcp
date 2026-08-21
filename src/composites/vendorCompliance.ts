// ABOUTME: Which vendors have insurance/license expiring soon, grouped by the properties they
// ABOUTME: actually work at. vendor_directory has no property column, so this joins work_orders.
import type { AppFolioHttpClient } from "../http";
import type { CallerContext, CallEndpointDeps, CallEndpointResult } from "../database/tools";
import { runReport } from "../reports/tools";

export interface VendorComplianceDeps {
  reportsHttp: Pick<AppFolioHttpClient, "request">;
  callEndpoint: (
    deps: CallEndpointDeps,
    caller: CallerContext,
    operationId: string,
    params: Record<string, unknown>
  ) => Promise<CallEndpointResult>;
  callEndpointDeps: CallEndpointDeps;
}

export interface VendorComplianceEntry {
  id: string;
  vendorType: string;
  liabilityInsExpires: string;
  workersCompExpires: string;
  properties: string[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function vendorCompliance(
  deps: VendorComplianceDeps,
  caller: CallerContext,
  opts: { withinDays: number; asOf: string }
): Promise<{ vendors: VendorComplianceEntry[] }> {
  const cutoff = addDays(opts.asOf, opts.withinDays);

  const report = await runReport(deps.reportsHttp, "vendor_directory", {
    filters: { liability_expiration_to: cutoff },
  });

  const workOrdersResult = await deps.callEndpoint(deps.callEndpointDeps, caller, "getWorkOrders", {});
  const workOrders = workOrdersResult.executed ? (workOrdersResult.result as { vendor_id: string; PropertyId: string }[]) : [];

  const propertiesByVendor = new Map<string, Set<string>>();
  for (const wo of workOrders) {
    if (!propertiesByVendor.has(wo.vendor_id)) propertiesByVendor.set(wo.vendor_id, new Set());
    propertiesByVendor.get(wo.vendor_id)!.add(wo.PropertyId);
  }

  // Re-check the expiration window client-side: the server-side filter above is a performance
  // optimization (avoids paging through vendors we don't care about), not something this
  // composite can trust blindly. A report that ignores or mishandles the filter must not
  // silently widen "expiring soon" results.
  const vendors = (report.rows as {
    id: string;
    vendor_type: string;
    liability_ins_expires: string;
    workers_comp_expires: string;
  }[])
    .filter((row) => row.liability_ins_expires <= cutoff)
    .map((row) => ({
      id: row.id,
      vendorType: row.vendor_type,
      liabilityInsExpires: row.liability_ins_expires,
      workersCompExpires: row.workers_comp_expires,
      properties: Array.from(propertiesByVendor.get(row.id) ?? []),
    }));

  return { vendors };
}
