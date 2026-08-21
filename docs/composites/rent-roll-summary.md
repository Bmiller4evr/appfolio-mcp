# rent_roll_summary

**Question it answers:** occupancy (by unit count and by square footage) and the market-vs-actual rent gap, per property and portfolio-wide.

**Report called:** `rent_roll` (Reports API V2), one row per unit. Verified against AppFolio's own Reports API OpenAPI schema export, see `src/reports/operations.data.ts` for the exact columns and `.superpowers/sdd/verified-report-columns.md` for the source.

**Definitions:**
- **Occupied** - the report's `status` column matches `occupied` case-insensitively (the schema doesn't publish an enum, so this is treated as an opaque string). Anything else, including "Vacant" and any notice-to-vacate variants, counts as vacant for this tool's purposes.
- **Unit count** - `rent_roll` has no dedicated "unit count" column; each row is one unit, so occupied/vacant counts are just rows tallied by `status`.
- **Rent gap** - `market_rent - rent`, summed only over occupied units. Vacant units contribute 0, not their market rent, since there's no actual rent to compare against. Both columns are currency-formatted strings; non-digit characters (currency symbols, thousands separators) are stripped before parsing.
- **Square footage** - the report's `sqft` column, summed by occupancy status.

**Property filtering:** when `properties` is passed, it's applied twice: server-side via the report's `properties.properties_ids` filter, and again client-side against each row's `property_id`, matching the double-check pattern used in `vendor_compliance`. Every requested property id appears in `byProperty`, even one with zero matching rows (fully zeroed totals rather than a missing key).

**Assumptions:** one row per unit per the report's own `as_of_to` semantics; this tool does not de-duplicate or re-derive occupancy from lease dates itself.

**Truncation:** the underlying `run_report` call caps rows (500 by default), and this composite passes that cap's `truncated` flag straight through in its own result. Treat `truncated: true` as an incomplete answer: occupancy counts, square footage, and rent gap were then computed over only the first 500 units, so every total is a floor rather than a portfolio figure. Narrow the request with `properties` and re-run rather than reporting the numbers as-is.

**Read-only:** this composite only calls `runReport` against `rent_roll`, never a write-shaped operation.
