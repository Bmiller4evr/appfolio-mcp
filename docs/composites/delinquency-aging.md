# delinquency_aging

**Question it answers:** who owes money, how overdue, and which of them are actually a collections problem rather than routine lateness.

**Report called:** `delinquency` (Reports API V2), one row per delinquent tenant occupancy. Verified against AppFolio's own Reports API OpenAPI schema export, see `src/reports/operations.data.ts` for the exact columns and `.superpowers/sdd/verified-report-columns.md` for the source.

**Definitions:**
- **Aging buckets** - this tool sums the report's own `00_to30`/`30_to60`/`60_to90`/`90_plus` columns; it does not compute aging from due dates itself. If AppFolio's bucket boundaries ever change, this tool's output changes with them automatically. The report also exposes `30_plus`/`60_plus`, cumulative buckets meaning "30-or-more"/"60-or-more" - those overlap with the four discrete buckets above and are deliberately not summed into totals or balance.
- **Balance** - sum of all four discrete bucket columns for a tenant occupancy.
- **`minBalance` filter** - applied to that summed balance, not to any single bucket. A balance at or below `minBalance` is dropped from `tenants` (using `<=`, not `<`), so a $0 balance is never reported as delinquent even when `minBalance` is 0. Totals are unaffected by this filter: they sum every row the report returns, before any per-tenant filtering.
- **Tenant identity** - the report has no `tenant_id` column; its grain is the occupancy, identified by `occupancy_id`, with the tenant's display name in `name`. This tool exposes those as `occupancyId` and `tenantName` rather than inventing a `tenantId` the report doesn't provide.

**Property filtering:** when `properties` is passed, it's applied twice: server-side via the report's `properties.properties_ids` filter, and again client-side against each row's `property_id`, matching the double-check pattern used in `vendor_compliance` and `rent_roll_summary`.

**Assumptions:**
- `in_collections` is typed as a string by the schema with no published enum. This tool treats any value other than empty, `"no"`, `"false"`, or `"0"` (case-insensitive) as true. If real data serializes this differently, inspect it directly via `run_report` before trusting the flag.
- `late_count` in the plan's original prose is actually named `late` on the live schema.
- `collections_agency`, `payment_plan`, `nsf`, and `certified_funds_only` exist on the verified report but are not wired into this composite's output today - they're available on the raw report via `run_report` directly if needed.

**Read-only:** this composite only calls `runReport` against `delinquency`, never a write-shaped operation.
