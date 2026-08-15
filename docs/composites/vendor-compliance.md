# vendor_compliance

**Question it answers:** which vendors have insurance or licenses expiring within N days, grouped by the properties they actually work at.

**Reports/endpoints called:**
- `vendor_directory` (Reports API V2), filtered server-side on `liability_expiration_to`.
- `getWorkOrders` (Database API), read through the same role-scoped `callEndpoint` path every other tool uses, no private route.

**Join logic:** `vendor_directory` has no property column. Property attribution comes entirely from `work_orders.vendor_id` mapped to `work_orders.PropertyId`, deduplicated per vendor. A vendor who has never had a work order shows an empty `properties` array, that's not a bug, it means no property attribution exists yet, not that the vendor is uncompliant everywhere.

**Filtering:** the expiration window is applied twice: once as a server-side filter on the report request (so we don't page through vendors we don't care about), and again client-side against `liability_ins_expires` after the report responds. The client-side check is not redundant: it's the composite's own guarantee that "expiring soon" is correct even if the report ignores or mishandles the server-side filter.

**Assumptions:** only `liability_ins_expires` drives the filter today (via `liability_expiration_to`); `workers_comp_expires` and the other expiration columns are returned but not separately filtered. Expand the filter set if you need "any of these expiring soon" rather than "liability specifically."

**Read-only:** this composite never calls `confirmWrite` or any write-shaped operation. It only reads `vendor_directory` (Reports API) and `getWorkOrders` (Database API, a READ operation), both through their existing role-scoped paths.
