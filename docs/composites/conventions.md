# Composite output conventions

Rules every composite in `src/composites/` follows. Each one exists because breaking it produced
a real, shipped bug in this project, not because it sounded like good practice. When adding a new
composite, or changing what an existing one returns, check it against this list before shipping.

## 1. Never key or label output by a bare id with no name next to it

A caller asking a plain-English question ("what's vacant at 123 Main St") cannot make sense of a
result keyed `"244": {...}`. Every join to a property, vendor, or tenant resolves a human-readable
label alongside the id, using the shared `firstPopulated(name, address, fullDescriptor)` fallback
in [`support.ts`](../../src/composites/support.ts): first non-blank value wins, in that order.

This has shipped broken three separate times: `work_order_aging` originally returned raw
`propertyId`/`vendorId` with no names at all (fixed after a real user reported it unusable);
`vendor_compliance` read a nonexistent `row.id` field before the vendor identity fix; and
`rent_roll_summary`'s `byProperty` was keyed by bare `property_id` with no name anywhere in the
entry until this was written. Each time, the fix was the same shape: find what name-ish columns
the *live* response actually carries (the report catalog has undersold this before, see #6), pick
a fallback order, wire it in.

## 2. An id stays in the output too, just never alone

A caller often needs the id back for a follow-up call (e.g. to pass into a `properties` filter),
so resolving a name is additive, not a replacement. Every composite returns both.

## 3. A requested-but-missing entity stays in the result, nulled, not dropped

If a caller asks about a specific property/vendor/tenant and the join finds nothing for it, that
entity still appears in the output with nulled fields, rather than silently vanishing. A missing
key reads as "this doesn't exist"; a present key with `null` fields reads as "this exists, we just
don't have that detail," which is usually the true state (e.g. a property AppFolio has hidden,
but whose work order history still references it).

Covered by tests in every composite that supports a `properties` filter: see `vendorCompliance`'s
"keeps a property whose record the lookup never returns, rather than dropping it" and
`rentRollSummary`'s "filters to requested properties and still reports a property with zero rows".

## 4. Every composite reports `truncated`

The reports and list reads underneath these composites all cap their row count (`runReport`
defaults to 500; `callEndpoint`'s Database API pagination caps at 100 pages). A composite built on
a capped read passes that cap's `truncated` flag straight through, unchanged, rather than
absorbing it. A caller has no other way to tell a complete answer from a partial one, and a
partial answer that reads as complete is worse than one that says so.

## 5. An unrecognized value throws, it doesn't get silently miscounted

When a composite depends on a report column having one of a known set of values, an unexpected
value is a loud error, not a guessed bucket. `rentRollSummary`'s `isOccupied` throws
`UnknownUnitStatusError` on any status outside its known vocabulary, because the earlier version
compared against the literal string `"occupied"`, silently classified every unit as vacant, and
reported a fully-vacant portfolio with total confidence. A thrown error is recoverable (inspect
the raw report, extend the vocabulary); a wrong number that looks right is not.

## 6. Verify a report's real columns live before trusting its catalog entry

`src/reports/operations.data.ts`'s column lists are sourced from an OpenAPI schema export, a
third-party attribution, or a live check, and the first two have both undersold what a report
actually returns: `rent_roll`, `delinquency`, and `work_order` all carry `property_address`
(and `rent_roll`/`work_order` also carry the full `property` descriptor) in their live response,
none of which the schema export mentioned, and all three composites depend on them. Before
wiring a new fallback or column into a composite, run the report live and check the response
keys; don't assume the catalog entry is exhaustive.
