# work_order_aging

**Question it answers:** which work orders are old or stalled, grouped by property, vendor, and priority.

**Report called:** `work_order` (Reports API V2), one row per work order. Verified against AppFolio's own Reports API OpenAPI schema export, see `src/reports/operations.data.ts` for the exact columns and `.superpowers/sdd/verified-report-columns.md` for the source.

**Definitions:**
- **Age** - days between the report's `created_at` column and `asOf`, computed for every row returned. This tool does not assume a status value; callers filter to open work orders (or any other status) via the `status` option.
- **`scheduled_start_passed`** - `scheduled_start` is before `asOf` and the work order has no `completed_on` date. Distinct from age: a work order can be young but already past its own scheduled start.
- **`estimate_overdue`** - `estimate_req_on` is before `asOf` and the work order has no `estimated_on` date. Independent of scheduling - a work order can be neither scheduled nor estimated and would show both flags.
- Both stall signals are suppressed once `completed_on` is set. A completed work order isn't stalled by definition, regardless of whether a scheduled-start date passed or an estimate was ever recorded before completion.

**Column note:** the report has two similarly-named date columns, `completed_on` ("Completed On") and `work_completed_on` ("Work Done On"). This composite uses `completed_on` only; `work_completed_on` is a distinct field and is not consulted here.

**Property and status filtering:** `properties` and `status` are applied client-side against each row's `property_id` and `status`. The report also exposes server-side filters (`property.*`, `work_order_statuses`, `priority`, `status_date_range_from`/`status_date_range_to`) but this composite does not send them: the OpenAPI export only confirms `property.*`'s existence structurally (by analogy to `rent_roll`'s `properties.properties_ids` filter), not its exact leaf field name, so this tool avoids guessing at an unverified filter shape and relies on client-side filtering, which is fully verified against the response schema.

**Assumptions:** age and both stall signals are presence/absence and before/after checks on the verified report's own date columns - no external clock or vendor-side data is consulted.

**Read-only:** this composite only calls `runReport` against `work_order`, never a write-shaped operation.
