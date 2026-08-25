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

interface WorkOrder {
  VendorId: string;
  PropertyId: string;
}

// Database API records come wrapped in a { data: [...] } envelope, with PascalCase fields (the
// Reports API's snake_case is a separate convention and does not apply here). next_page_path
// carries the whole follow-up request, page number included, and is null on the last page.
interface WorkOrderPage {
  data: WorkOrder[];
  next_page_path?: string | null;
}

// A ten-year work order history is large but finite, so this ceiling exists only to keep a
// response that never stops advertising a next page from spinning forever. Reaching it is
// reported rather than swallowed, since stopping early is the truncation this pagination fixes.
const MAX_WORK_ORDER_PAGES = 100;

// next_page_path is absolute against the host ("/api/v0/work_orders?page[number]=2"), while the
// HTTP client's base URL already ends in the version prefix, so the prefix comes off before the
// two are concatenated.
function relativeToVersionedBase(path: string): string {
  return path.replace(/^\/api\/v\d+/, "");
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

  // The Database API refuses a GET list request carrying no filter at all ("must include a filter
  // for [Id] or [LastUpdatedAtFrom]"), and reads the filter under OpenAPI's deepObject style, so
  // the query key is bracketed rather than flat. A vendor's compliance standing depends on every
  // property it has ever worked at, so the window reaches back ten years to take in the whole
  // history rather than a recent slice of it.
  const workOrdersUpdatedFrom = `${addDays(opts.asOf, -3650)}T00:00:00Z`;
  const workOrdersResult = await deps.callEndpoint(deps.callEndpointDeps, caller, "getWorkOrders", {
    query: { "filters[LastUpdatedAtFrom]": workOrdersUpdatedFrom },
  });
  // Only the first page can go through callEndpoint: it resolves the request path from the
  // operation's own fixed path template, so it has nowhere to put the follow-up path AppFolio
  // hands back. Later pages take the same HTTP client directly, having already cleared the
  // role and discoverability checks callEndpoint ran on the first one.
  const workOrders: WorkOrder[] = [];
  let page = workOrdersResult.executed ? (workOrdersResult.result as WorkOrderPage) : undefined;
  let pagesRead = 0;
  while (page) {
    workOrders.push(...(page.data ?? []));
    pagesRead++;
    const nextPagePath = page.next_page_path;
    if (!nextPagePath) break;
    if (pagesRead >= MAX_WORK_ORDER_PAGES) {
      console.warn(
        `vendorCompliance: stopped following work order pages at ${pagesRead}; property attribution may be incomplete`
      );
      break;
    }
    page = (await deps.callEndpointDeps.http.request(
      "GET",
      relativeToVersionedBase(nextPagePath),
      {}
    )) as WorkOrderPage;
  }

  const propertiesByVendor = new Map<string, Set<string>>();
  for (const wo of workOrders) {
    if (!propertiesByVendor.has(wo.VendorId)) propertiesByVendor.set(wo.VendorId, new Set());
    propertiesByVendor.get(wo.VendorId)!.add(wo.PropertyId);
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
