# AppFolio MCP — Design Spec

**Status:** design complete, pending written-spec review
**Author:** Bret Miller + Claude
**Related:** brainstorming started in a prior session ("MCP design brainstorming", 2026-07-30, `global-inbox`), continued and finalized in `access-realty-app` on 2026-08-13.

## Summary

A remote MCP server giving Claude read access to an AppFolio property-management database (via the Reports API and Database API) plus role-scoped, human-confirmed write access. Built for Perpetual Realty, hosted so Justin Brown (Perpetual Realty's principal) can connect to it from Claude Team desktop, and published as a public, MIT-licensed repo — a portfolio piece built ahead of AppFolio shipping an official MCP integration.

## Goals

- Let Justin ask AppFolio questions (rent roll, delinquency, vendor compliance, work orders) conversationally instead of clicking through the AppFolio UI.
- Let Justin perform a curated set of write actions — centered on running unit turns and managing work orders — from the same conversation, with a human-confirmed approval step on every mutation.
- Let Bret administer the account and perform the fuller set of PM-data writes the API supports.
- Ship as a genuine, reusable open-source artifact: real architecture decisions (catalog-backed engine over a long tail of endpoints, layered with hand-written composites), not just an API wrapper.

## Scope decomposition

This request bundles subsystems with different trust models. In scope for this spec:

1. **AppFolio MCP core** — catalog engine (`list`/`describe`/`run` over Reports and Database API) plus hand-written composite tools.
2. **Role-scoped, human-confirmed write access** — a human (Justin or Bret, in their own Claude session) reviews a preview and approves each mutating call.
3. **Remote hosting for Justin** — a Vercel-hosted server Justin's Claude Team desktop app connects to as a custom connector.

**Explicitly out of scope, deferred to its own future project:** autonomous agents that call tenants/vendors via SimpleVOIP to follow up on work tickets. The confirm-gate pattern in this spec depends on a human reading the preview before a write executes — that's the entire safety argument for handing out write access at all. An unsupervised agent deciding on its own to call a tenant has no human in the loop at that moment, so the safety argument doesn't carry over. It needs its own design: consent/compliance review for outbound contact, what the agent is allowed to say, an escalation path, and (per the API research below) an entirely separate integration, since AppFolio's API has no messaging capability of any kind for it to build on.

## Build vs. fork, and license

**Build our own, MIT-licensed, public from day one.** Not a fork of existing prior art. Two things changed this from the original brainstorming session's more cautious "fixtures only, verify later" plan:

- Bret now has AppFolio Developer Space access and can generate a real Database API client id/secret for Perpetual Realty, so the implementation can be validated against a live database rather than trusting an unverified spec export.
- Forking an existing repo (even a permissively licensed one) is a weaker "I built this" story for the portfolio goal than an independently authored server.

**Provenance discipline carried over from the original session:** the public repos surveyed there — [NightSquawk/appfolio-mcp-server](https://github.com/NightSquawk/appfolio-mcp-server) (AGPL, architecture cross-check only) and [CryptoCultCurt/appfolio-mcp-server](https://github.com/CryptoCultCurt/appfolio-mcp-server) (ISC, the only one that's actually run against live V2 Reports) — get cited with attribution wherever their verified V2 report column/filter names are reused directly; everything else is independently derived from AppFolio's own docs and marked "listed, not yet described" where we can't verify it first-party. No public/private split — start fully public, decide per-feature later if something needs to be private (Bret's call, reasoning: if a feature is genuinely useful there's no harm sharing it).

## Architecture

### Repo & module layout

```
src/
  config.ts        credentials + role/feature flags, fails loudly with named errors
  http.ts           basic auth to AppFolio, rate limiting, retry, pagination
  audit.ts          Slack webhook notifier for write events
  auth/             WorkOS AuthKit wiring (connector-level auth, see below)
  catalog/          registry of operation descriptors + search/describe, shared across both AppFolio APIs
  reports/          report descriptors (V2) + run
  database/         151 Database API operation descriptors + call, with role-scope metadata
  composites/       hand-written domain tools (see Tool Surface)
  routes/           Next.js route handler wiring (mcp-handler + authHandler)
```

Tool logic stays transport-agnostic (plain functions over the catalog/reports/database modules); only `routes/` knows it's running on Vercel. This departs from the plain-stdio shape of Bret's other two MCPs (`google-marketing-mcp`, `meta-marketing-mcp`) — not an oversight, a consequence of remote hosting requiring HTTP transport.

The catalog only owns what's genuinely shared between the two AppFolio APIs — descriptor shape, search, describe. Reports ("pick a report, pass filters, get rows") and Database API (REST resources with path params, bodies, 48 tags) each bring their own `run`/`call`, because forcing one execution abstraction over both would cost more than it saves.

### Transport & hosting

- **Framework:** Next.js on Vercel, using Vercel's `mcp-handler` package (wraps the official MCP TypeScript SDK into a route handler). Transport is Streamable HTTP, the current MCP remote-transport standard.
- **Hosting:** a **new, dedicated Vercel project** under the existing "Access Realty" team — not folded into `mhb-lead-machine` or any other existing project. Reasoning: credential isolation (Perpetual Realty's unfiltered AppFolio secret shouldn't share blast radius with Zoho creds), and portfolio integrity (the public repo should be exactly what's deployed). Marginal cost is $0 — Vercel bills per team/seat, not per project, and a single-user internal tool is far inside Pro-tier included usage.
- **Custom connector registration:** Team-plan Owners add the server once at *Organization Settings → Connectors → Add → Custom → Web*; members then connect individually at *Customize → Connectors*. Bret administers the Team account, so this doesn't require Justin to have admin access.

### Auth — two separate trust boundaries

1. **Connector auth** — "is this Justin/Bret." Implemented with **WorkOS AuthKit**, wired via Vercel's `mcp-handler` `authHandler` pattern (a maintained joint Vercel + WorkOS reference template — real OAuth 2.1, not hand-rolled). WorkOS's free tier covers up to 1M MAU, so this is $0 at Perpetual Realty's scale. Alternatives considered: Clerk and Auth0 are also free at this scale and were ruled out only on integration risk, not cost — neither has an equivalent proven joint template with Vercel's MCP adapter. Supabase Auth was considered given Bret's existing fluency with it, but isn't confirmed to support acting as a full OAuth authorization server for a third-party client (Claude) the way AuthKit does, so it wasn't chosen for this role.
2. **AppFolio credentials** — "what can this server do to Perpetual Realty's data." Live only as Vercel environment variables, never touch a user's WorkOS session, identical for every authenticated caller (AppFolio's Database API credential is unfiltered/all-or-nothing per credential, so there is no per-user AppFolio-side scoping to inherit — see Roles below for how we build that ourselves).

**Open verification item:** the MCP spec revised 2026-07-28, deprecating Dynamic Client Registration in favor of Client ID Metadata Documents. Confirm the WorkOS/Vercel joint template has caught up to that revision before scaffolding the implementation — don't assume the blog-post-era template is current.

## Roles & permissions

Two roles, assigned via WorkOS (org membership / custom attribute), read off the token on every request:

- **`owner`** (Justin Brown) — full read access to everything. Write access is a curated, narrow allowlist of **19 operations**, chosen around the actual workflow he performs day to day: running unit turns and managing work orders. See `docs/reference/database-api-role-scopes.md` for the full 151-operation mapping; the owner allowlist:

  | Category | Operations |
  |---|---|
  | Work Orders | `createWorkOrder`, `updateWorkOrder`, `createWorkOrderNote`, `updateWorkOrderNote`, `createWorkOrderAttachment` |
  | Tenants | `createTenantNote`, `updateTenantNote` (never the whole-record `updateTenant` PATCH) |
  | Vendors | `createVendor`, `updateVendor`, `createVendorNote`, `updateVendorNote` |
  | Units | `createUnitNote`, `updateUnitNote`, `createUnitAttachment`, `createUnitPhoto`, `updateUnitPhoto` (never `deleteUnitPhoto`) |
  | Inspections | `createInspection`, `updateInspection`, `createInspectionAttachment` |

- **`admin`** (Bret) — full read, full non-destructive write across the rest of the catalog (Bills, Charges, GL Accounts, Journal Entries, Leases, Listings, Rental Applications, Showings, Properties, Owners, Community Associations, plus `updatePropertyGroup`/`updatePortfolio`/`createOwnerGroup`/`updateOwnerGroup` — the entire account-configuration write surface the API exposes; there is no user-management or custom-field-management write capability at all, for either role, because AppFolio itself doesn't expose one). Destructive operations (5 deletes, 23 bulk operations) require `admin` **and** a separate `APPFOLIO_ENABLE_DESTRUCTIVE` flag, regardless of role.

**Discoverability.** The original design principle — a disabled tool is absent, not refusing, because a tool that refuses is a prompt away from being argued with — gets a deliberate, narrow exception here per Bret's request: Justin should be able to learn a write capability exists and ask Bret to expand his access, rather than the model staying silent about capabilities it can see in the spec but was told to hide.

- **Ordinary admin-only writes** (e.g. `updateBill`): visible to `owner` via `list_endpoints`/`describe_endpoint` with `callable: false, reason: "admin-only — ask Bret to enable"`. `call_endpoint` still rejects the call server-side regardless of what's listed — discovery and execution are gated independently, so this is an honest catalog, not a tool that argues back.
- **Destructive operations**: fully invisible to `owner` in the catalog, not just uncallable. No legitimate discovery value, real downside (an enumerable list of every irreversible action on the account).
- The "ask Bret" step is purely conversational for v1 — Claude tells Justin who to ask, no automated request/grant workflow. Worth building later if it turns out to matter.

**Known limitation, not resolved in v1:** because there's a single shared AppFolio credential behind both roles, adding a third person means adding another WorkOS identity with one of the two existing roles — there's no way today to hand-craft a third permission tier without extending the role model itself.

## Tool surface

**Six catalog tools**, unchanged from the original session's design:

| Tool | Signature | Returns |
|---|---|---|
| `list_reports` | `(search?)` | id, name, what it answers, date-range support, filter support, column count |
| `describe_report` | `(report_id)` | every column with type, available filters, example call |
| `run_report` | `(report_id, filters?, columns?, max_rows?)` | rows, count, truncation flag |
| `list_endpoints` | `(search?, tag?, method?)` | operation id, method, path, tag, summary, callable-by-caller flag |
| `describe_endpoint` | `(operation_id)` | params, request schema, response schema |
| `call_endpoint` | `(operation_id, path_params?, query?, body?)` | preview (for mutating ops) or response (for reads / after confirm) |

**Four composite tools**, unchanged, each requiring a written contract at `docs/composites/<tool>.md` (what question it answers, which reports/endpoints it calls, join logic, exact definition of every computed field, assumptions) — the same text seeds the tool's MCP description:

1. `rent_roll_summary(as_of?, properties?)` — occupancy by unit count and square footage, market-vs-actual rent gap, vacancy by rent-ready state, expirations by month.
2. `delinquency_aging(properties?, min_balance?)` — aging buckets plus `InCollections`/`CollectionsAgency`/`PaymentPlan`/`NSF`/`CertifiedFundsOnly`/`LateCount`.
3. `vendor_compliance(within_days=30, properties?)` — insurance/license expirations, joined against `work_order` for property attribution since `vendor_directory` carries no property column of its own.
4. `work_order_aging(status?, properties?, as_of?)` — age buckets from creation against completion, plus stall signals (scheduled-start-in-the-past-with-no-completion, estimate-requested-with-no-estimate).

Composites remain read-only permanently. Any write happens through `call_endpoint`, where the confirm-gate and role check both live — never buried inside a domain tool.

### Write path

`call_endpoint` on a mutating operation returns a **preview**, never executes directly:

- The preview is bound to the exact payload via a hash-based confirm token (method + resolved URL + body). Changing any field voids the token — what executes is provably what was previewed.
- Where the resource has a fetch-by-id, the preview renders a field-level diff against current state; where it doesn't, the preview says so rather than implying it verified anything.
- `confirm_write(token)` executes.
- Two independent flags, both default off: `APPFOLIO_ENABLE_WRITES` (single-record POST/PATCH/PUT, filtered by role as above) and `APPFOLIO_ENABLE_DESTRUCTIVE` (DELETE + `bulk_*`, admin-only regardless of the first flag). **Decision for this deployment: both ship enabled at launch** — the original session's "writes wait for a validated test environment" caveat no longer applies now that live Perpetual Realty credentials exist to validate against directly.

A caveat carried over from the original design and worth restating: the confirm-gate is not a security boundary against the model itself — it's the same model calling `confirm_write` that already decided to call `call_endpoint`. What it actually buys: the exact payload lands in the human-readable transcript before the client's own approval prompt fires (that's the real boundary, and it lives in the MCP client, not in us), the token provably binds what's confirmed to what's executed, and the audit log captures intent before execution so an abandoned or failed write still leaves a trace.

## Persistence / audit logging

No dedicated database — deliberately avoided for a single-tenant internal tool at this volume.

- **Writes** (preview issued, confirmed, executed, outcome): posted to a dedicated Slack channel, **`#appfolio-mcp-audit`**, using the same webhook pattern as `#app-audit` in `access-realty-app` (a new, separate channel/webhook — not shared with that unrelated business's audit trail). Logged as **metadata, not payloads** — operation, resource type/id, who, when, outcome — not the actual field values changed. The full human-readable diff already lives in the approving user's Claude transcript at confirmation time; the Slack log's job is an independent, durable record for accountability, not a second copy of tenant financial data sitting in Slack.
- **Reads:** no dedicated logging. Vercel's own ambient function logs are sufficient since nothing changed and there's nothing to reconstruct later.

Slack was chosen over relying on Vercel's dashboard logs specifically for writes because Vercel's runtime log retention is short (days, not the weeks a billing dispute might take to surface), and Slack gives passive visibility (Bret finds out without going to look) as well as durability.

## Reference material

Generated directly from the AppFolio Database API's embedded OpenAPI 3.0 spec (`database_api_March_1_2026.html`, Redocly export):

- [`docs/reference/database-api-operations.md`](../reference/database-api-operations.md) — all 151 operations, grouped by tag, classified READ/WRITE/DESTRUCTIVE.
- [`docs/reference/database-api-role-scopes.md`](../reference/database-api-role-scopes.md) — the same 151 operations mapped to `owner`/`admin` executability and discoverability, per the Roles section above.

## Findings from API research (worth keeping visible, not just implicit in the design above)

- **No messaging capability of any kind.** Checked every operation summary/tag for email, SMS, messaging, notification, or communication-sending capability. The only near-hit is `Mailing Letters` (physical postal mail-merge records, not a send action). This is why SimpleVOIP-driven tenant/vendor follow-up is necessarily a separate integration, not a feature of this API.
- **Realm-X (AppFolio's own in-app AI assistant) has no API surface.** It's a permission toggle in AppFolio's User Roles UI, not one of the 48 Database API tags. Not buildable against this catalog.
- **Account/user administration is nearly unwritable via the API even for admins.** `Users` and `Custom Fields` are read-only — no create/update/delete, for any role, because AppFolio doesn't expose it. The entire "account configuration" write surface is 4 operations: `updatePropertyGroup`, `updatePortfolio`, `createOwnerGroup`, `updateOwnerGroup`.
- **Tenant/Vendor/Work Order/Unit notes are separate sub-resources from the parent record's PATCH.** This is what makes the narrow `owner` allowlist possible — Justin can add notes without being able to PATCH a tenant's core record (contact info, financials, lease terms).
- **Target the Reports API's V2, not V1.** V1 (PascalCase columns) is being deprecated; V2 (snake_case, POST + JSON body, `next_page_url` pagination, not rate-limited) is where new development should target. Same credentials work across V0/V1/V2.

## Not in v1

- Autonomous SimpleVOIP-driven tenant/vendor follow-up agents (see Scope decomposition above) — separate future project.
- Automated "request expanded access" workflow — Justin asks Bret conversationally for now.
- A third permission tier / per-user fine-grained scoping beyond `owner`/`admin`.
- Webhook receiver, bulk-create composites, or any write composite (composites stay read-only permanently).
- Unit-turn-adjacent operations not explicitly scoped in: pricing matrix writes, unit-photo deletion.

## Open items to resolve during implementation

1. Confirm the WorkOS/Vercel `mcp-handler` joint template supports the 2026-07-28 MCP spec revision (CIMD, not just DCR) before scaffolding.
2. Generate real Perpetual Realty Database API and Reports API credentials from Developer Space; validate the full read surface live before implementation is considered done.
3. V2 Reports catalog coverage: ~50 reports have verified V2 column/filter names via the CryptoCultCurt repo (attributed on reuse); the remainder of AppFolio's ~137 V2 reports are known by id only until the in-app Manage API Settings → Reports API Documentation page can be read directly (requires a Perpetual Realty database on PLUS or higher — tier status not yet confirmed at time of writing).
