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

// callEndpoint follows every page of a list read itself and hands back the whole thing joined, so
// a READ result here is always either { data, count, truncated } already whole, or the { executed:
// false } shape a write preview uses (never reachable for the read-only operations this file
// calls, but the type still has to be narrowed).
interface ListResult<T> {
  data: T[];
  truncated: boolean;
}

function asListResult<T>(result: CallEndpointResult, what: string): ListResult<T> {
  if (!result.executed) throw new Error(`vendorCompliance: ${what} did not execute as a read`);
  const page = result.result as ListResult<T>;
  if (page.truncated) {
    console.warn(`vendorCompliance: the ${what} read came back truncated; property attribution may be incomplete`);
  }
  return page;
}

// filters[Id] takes a comma-separated list, so the properties behind a whole portfolio's work
// orders resolve in a couple of requests rather than one per property. Confirmed live that a
// hundred ids in one request come back in a single unpaginated response.
const PROPERTY_LOOKUP_BATCH_SIZE = 100;

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    for (const property of asListResult<Property>(result, "property").data) {
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
  const workOrders = asListResult<WorkOrder>(workOrdersResult, "work order").data;

  const propertiesByVendor = new Map<string, Set<string>>();
  for (const wo of workOrders) {
    if (!wo.VendorId) continue;
    if (!propertiesByVendor.has(wo.VendorId)) propertiesByVendor.set(wo.VendorId, new Set());
    propertiesByVendor.get(wo.VendorId)!.add(wo.PropertyId);
  }

  // Re-checked here, client-side, as a backstop rather than the primary filter: the server-side
  // liability_expiration_to filter is confirmed working (291 vs. 301 rows across two cutoffs,
  // live), but this composite still shouldn't trust a report's filtering blindly, matching the
  // same defensive pattern used elsewhere in this project. Most of a real directory has no
  // expiration on file at all, and no date is not an expiration inside the window.
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
