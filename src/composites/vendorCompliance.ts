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

// name is null for a property the lookup returned nothing for, which is how a record AppFolio no
// longer hands back keeps its place in the join instead of vanishing from it.
export interface VendorProperty {
  id: string;
  name: string | null;
}

export interface VendorComplianceEntry {
  id: string;
  vendorId: number;
  name: string | null;
  vendorType: string;
  liabilityInsExpires: string;
  workersCompExpires: string | null;
  properties: VendorProperty[];
}

// vendor_directory's real columns, confirmed against a live response. There is no "id": a vendor
// is identified by vendor_id, the number AppFolio's own UI shows, and by vendor_integration_id,
// the UUID every Database API record refers to that vendor by. company_name carries the business
// name and name the contact person, and either can be null on its own.
interface VendorDirectoryRow {
  vendor_id: number;
  vendor_integration_id: string;
  company_name: string | null;
  name: string | null;
  vendor_type: string;
  liability_ins_expires: string | null;
  workers_comp_expires: string | null;
}

// A work order's VendorId is the vendor's UUID, so vendor_integration_id is what joins the two,
// not the numeric vendor_id. It is null on work orders the management company handled itself.
interface WorkOrder {
  VendorId: string | null;
  PropertyId: string;
}

interface Property {
  Id: string;
  Name: string | null;
  Address1: string | null;
}

// Database API records come wrapped in a { data: [...] } envelope, with PascalCase fields (the
// Reports API's snake_case is a separate convention and does not apply here). next_page_path
// carries the whole follow-up request, page number included, and is null on the last page.
// callEndpoint joins the pages of a list read itself and reports a read it had to cut short as
// truncated, so a response arrives here either already whole or flagged as partial.
interface Page<T> {
  data: T[];
  next_page_path?: string | null;
  truncated?: boolean;
}

// A ten-year work order history is large but finite, so this ceiling exists only to keep a
// response that never stops advertising a next page from spinning forever. Reaching it is
// reported rather than swallowed, since stopping early is the truncation this pagination fixes.
const MAX_PAGES = 100;

// filters[Id] takes a comma-separated list, so the properties behind a whole portfolio's work
// orders resolve in a couple of requests rather than one per property. Confirmed live that a
// hundred ids in one request come back in a single unpaginated response.
const PROPERTY_LOOKUP_BATCH_SIZE = 100;

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

// Only the first page can go through callEndpoint: it resolves the request path from the
// operation's own fixed path template, so it has nowhere to put the follow-up path AppFolio hands
// back. Later pages take the same HTTP client directly, having already cleared the role and
// discoverability checks callEndpoint ran on the first one.
async function collectPages<T>(
  deps: VendorComplianceDeps,
  first: CallEndpointResult,
  what: string
): Promise<T[]> {
  const rows: T[] = [];
  let page = first.executed ? (first.result as Page<T>) : undefined;
  let pagesRead = 0;
  if (page?.truncated) {
    console.warn(
      `vendorCompliance: the ${what} read came back truncated; property attribution may be incomplete`
    );
  }
  while (page) {
    rows.push(...(page.data ?? []));
    pagesRead++;
    const nextPagePath = page.next_page_path;
    if (!nextPagePath) break;
    if (pagesRead >= MAX_PAGES) {
      console.warn(
        `vendorCompliance: stopped following ${what} pages at ${pagesRead}; property attribution may be incomplete`
      );
      break;
    }
    page = (await deps.callEndpointDeps.http.request(
      "GET",
      relativeToVersionedBase(nextPagePath),
      {}
    )) as Page<T>;
  }
  return rows;
}

// A property an AppFolio user has hidden (sold, off management) still owns the work order history
// that attributed a vendor to it, and getProperties answers filters[Id] for it with an empty data
// array unless IncludeHidden comes along, so the flag is what keeps a legitimately matched
// property in the join.
async function propertyNames(
  deps: VendorComplianceDeps,
  caller: CallerContext,
  propertyIds: string[]
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  for (let i = 0; i < propertyIds.length; i += PROPERTY_LOOKUP_BATCH_SIZE) {
    const batch = propertyIds.slice(i, i + PROPERTY_LOOKUP_BATCH_SIZE);
    const result = await deps.callEndpoint(deps.callEndpointDeps, caller, "getProperties", {
      query: { "filters[Id]": batch.join(","), "filters[IncludeHidden]": "true" },
    });
    for (const property of await collectPages<Property>(deps, result, "property")) {
      names.set(property.Id, property.Name ?? property.Address1);
    }
  }
  return names;
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
  const workOrders = await collectPages<WorkOrder>(deps, workOrdersResult, "work order");

  const propertiesByVendor = new Map<string, Set<string>>();
  for (const wo of workOrders) {
    if (!wo.VendorId) continue;
    if (!propertiesByVendor.has(wo.VendorId)) propertiesByVendor.set(wo.VendorId, new Set());
    propertiesByVendor.get(wo.VendorId)!.add(wo.PropertyId);
  }

  // The expiration window is enforced here, client-side, because the report does not enforce it
  // itself: liability_expiration_to comes back with every vendor in the directory no matter what
  // date it is given (confirmed live, three different cutoffs, identical 301-row response). Most
  // of a real directory has no expiration on file at all, and no date is not an expiration
  // inside the window.
  const expiring = (report.rows as unknown as VendorDirectoryRow[]).filter(
    (row) => row.liability_ins_expires !== null && row.liability_ins_expires <= cutoff
  );

  const joinedPropertyIds = new Set<string>();
  for (const row of expiring) {
    for (const id of propertiesByVendor.get(row.vendor_integration_id) ?? []) joinedPropertyIds.add(id);
  }
  const names = joinedPropertyIds.size ? await propertyNames(deps, caller, [...joinedPropertyIds]) : new Map();

  const vendors = expiring.map((row) => ({
    id: row.vendor_integration_id,
    vendorId: row.vendor_id,
    name: row.company_name ?? row.name,
    vendorType: row.vendor_type,
    liabilityInsExpires: row.liability_ins_expires!,
    workersCompExpires: row.workers_comp_expires,
    properties: Array.from(propertiesByVendor.get(row.vendor_integration_id) ?? [], (id) => ({
      id,
      name: names.get(id) ?? null,
    })),
  }));

  return { vendors };
}
