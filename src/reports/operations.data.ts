// ABOUTME: AppFolio Reports API (V2) catalog. vendor_directory, rent_roll, delinquency, and
// ABOUTME: work_order have verified columns/filters, everything else is listed by id pending verification.
export interface ReportColumn {
  name: string;
  type: string;
}

export interface ReportDescriptor {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  verified: boolean;
  source?: string;
  columns: ReportColumn[];
  filters: ReportColumn[];
}

// Attribution: vendor_directory's V2 column/filter names below are reused, with attribution
// under its ISC license, from https://github.com/CryptoCultCurt/appfolio-mcp-server, the
// only prior implementation verified against AppFolio's live V2 Reports API at design time.
export const REPORTS: ReportDescriptor[] = [
  {
    id: "vendor_directory",
    title: "Vendor Directory",
    summary: "All vendors with license/insurance expirations and compliance flags.",
    tags: ["vendors", "compliance"],
    verified: true,
    source: "cryptocultcurt-v2 (ISC, attributed)",
    columns: [
      { name: "vendor_type", type: "string" },
      { name: "portal_activated", type: "boolean" },
      { name: "created_by", type: "string" },
      { name: "workers_comp_expires", type: "date" },
      { name: "liability_ins_expires", type: "date" },
      { name: "epa_cert_expires", type: "date" },
      { name: "state_lic_expires", type: "date" },
      { name: "do_not_use_for_work_order", type: "boolean" },
    ],
    filters: [
      { name: "liability_expiration_to", type: "date" },
      { name: "workers_comp_expiration_to", type: "date" },
      { name: "epa_expiration_to", type: "date" },
      { name: "auto_insurance_expiration_to", type: "date" },
      { name: "state_license_expiration_to", type: "date" },
      { name: "contract_expiration_to", type: "date" },
    ],
  },
  // rent_roll's V2 columns below are sourced from AppFolio's own Reports API OpenAPI schema
  // export, provided by the project owner (components.schemas.RentRollRequest/Response), not
  // browsed UI prose or a guess. See .superpowers/sdd/verified-report-columns.md.
  {
    id: "rent_roll",
    title: "Rent Roll",
    summary: "Occupancy and rent by unit.",
    tags: ["occupancy"],
    verified: true,
    source: "AppFolio Reports API OpenAPI schema export",
    columns: [
      { name: "property_id", type: "integer" },
      { name: "property_name", type: "string" },
      { name: "unit_id", type: "integer" },
      { name: "unit", type: "string" },
      { name: "sqft", type: "integer" },
      { name: "status", type: "string" },
      { name: "market_rent", type: "string" },
      { name: "rent", type: "string" },
      { name: "lease_to", type: "date" },
      { name: "tenant_id", type: "integer" },
      { name: "tenant", type: "string" },
    ],
    filters: [
      { name: "as_of_to", type: "date" },
      { name: "properties.properties_ids", type: "array" },
      { name: "unit_visibility", type: "string" },
      { name: "non_revenue_units", type: "string" },
    ],
  },
  // delinquency's V2 columns below are sourced from AppFolio's own Reports API OpenAPI schema
  // export, provided by the project owner (components.schemas.DelinquencyRequest/Response), not
  // browsed UI prose or a guess. See .superpowers/sdd/verified-report-columns.md.
  {
    id: "delinquency",
    title: "Delinquency",
    summary: "Aging balances by tenant.",
    tags: ["financial"],
    verified: true,
    source: "AppFolio Reports API OpenAPI schema export",
    columns: [
      { name: "property_id", type: "integer" },
      { name: "property_name", type: "string" },
      { name: "unit", type: "string" },
      { name: "unit_id", type: "integer" },
      { name: "occupancy_id", type: "integer" },
      { name: "name", type: "string" },
      { name: "tenant_status", type: "string" },
      { name: "00_to30", type: "string" },
      { name: "30_to60", type: "string" },
      { name: "60_to90", type: "string" },
      { name: "90_plus", type: "string" },
      { name: "in_collections", type: "string" },
      { name: "collections_agency", type: "string" },
      { name: "payment_plan", type: "string" },
      { name: "nsf", type: "integer" },
      { name: "late", type: "integer" },
      { name: "certified_funds_only", type: "string" },
    ],
    filters: [
      { name: "properties.properties_ids", type: "array" },
      { name: "tenant_statuses", type: "array" },
      { name: "amount_owed_in_account", type: "string" },
      { name: "balance_operator.amount", type: "string" },
      { name: "balance_operator.comparator", type: "string" },
    ],
  },
  // work_order's V2 columns below are sourced from AppFolio's own Reports API OpenAPI schema
  // export, provided by the project owner (components.schemas.WorkOrderRequest/Response), not
  // browsed UI prose or a guess. See .superpowers/sdd/verified-report-columns.md.
  {
    id: "work_order",
    title: "Work Orders",
    summary: "Open and closed maintenance tickets.",
    tags: ["maintenance"],
    verified: true,
    source: "AppFolio Reports API OpenAPI schema export",
    columns: [
      { name: "work_order_id", type: "integer" },
      { name: "work_order_number", type: "string" },
      { name: "property_id", type: "integer" },
      { name: "property_name", type: "string" },
      { name: "vendor_id", type: "integer" },
      { name: "vendor", type: "string" },
      { name: "priority", type: "string" },
      { name: "status", type: "string" },
      { name: "created_at", type: "date" },
      { name: "scheduled_start", type: "date" },
      { name: "completed_on", type: "date" },
      { name: "estimate_req_on", type: "date" },
      { name: "estimated_on", type: "date" },
    ],
    filters: [
      { name: "property.*", type: "object" },
      { name: "work_order_statuses", type: "array" },
      { name: "priority", type: "string" },
      { name: "status_date_range_from", type: "date" },
      { name: "status_date_range_to", type: "date" },
    ],
  },
];
