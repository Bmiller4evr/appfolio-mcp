// ABOUTME: AppFolio Reports API (V2) catalog. Only vendor_directory's columns/filters are
// ABOUTME: independently verified, everything else is listed by id pending verification.
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
  // Known by id (V1 CSV export + AppFolio's Reports API), V2 columns NOT yet verified.
  // Tasks 12-14 each verify and fill in the report they depend on before using it.
  { id: "rent_roll", title: "Rent Roll", summary: "Occupancy and rent by unit.", tags: ["occupancy"], verified: false, columns: [], filters: [] },
  { id: "delinquency", title: "Delinquency", summary: "Aging balances by tenant.", tags: ["financial"], verified: false, columns: [], filters: [] },
  { id: "work_order", title: "Work Orders", summary: "Open and closed maintenance tickets.", tags: ["maintenance"], verified: false, columns: [], filters: [] },
];
