# AppFolio Database API Reference

Source: `database_api_March_1_2026.html`

Base URL: `https://api.appfolio.com/api/v0`

Total operations: 151

Tags: 48

The Class column is a simple lightweight classification for readability only: READ for GET, DESTRUCTIVE for DELETE or any operation whose id/path matches "bulk", WRITE for everything else. It is not the role-scoping used elsewhere in this project.

## GET list filters (confirmed against the real spec and live traffic)

Every GET list endpoint (`getWorkOrders`, `getVendors`, `getProperties`, etc.) refuses an unfiltered request with `400: This GET request must include a filter for [Id] or [LastUpdatedAtFrom]`. The filter is not a flat query param: AppFolio uses OpenAPI's `deepObject` style, so the actual query string key is bracketed, e.g. `filters[LastUpdatedAtFrom]=2026-08-01T00:00:00Z` or `filters[Id]=<uuid>,<uuid>`. A flat `LastUpdatedAtFrom=...` or `filter[LastUpdatedAtFrom]=...` (missing the trailing `s`) is silently treated as no filter at all and gets the same generic 400. `call_endpoint`'s `query` param is a flat string map, so pass the bracketed key itself as the map key, e.g. `{ "filters[LastUpdatedAtFrom]": "2026-08-01T00:00:00Z" }`.

Response bodies from these endpoints are `{ "data": [...] }`, not a bare array, and every field is PascalCase (`VendorId`, `PropertyId`, `WorkOrderNumber`), unlike the Reports API v2's snake_case (`vendor_id`, `property_id`). Code bridging the two (like `vendor_compliance`, the only composite that touches the Database API's read side) must unwrap `.data` and read PascalCase keys.

## Database API v0 identifiers are UUIDs, not the Reports API's numeric ids

Every path param on a write operation (`WorkOrderId`, `PropertyId`, `VendorId`, `TenantId`, `UnitId`, etc.) is a UUID. The Reports API v2 (used by `run_report` and every composite) exposes a different, numeric id scheme for the same entities (e.g. a work order's `work_order_id: 4910` in a report row has no relation to the UUID its Database API record uses). There is no field in any Reports API report that carries the Database API UUID.

To write to a specific record known only by its Reports API id: `call_endpoint` the matching GET list operation with a `filters[LastUpdatedAtFrom]` filter wide enough to include it, then match the human-identifiable field both APIs share (e.g. a work order's `WorkOrderNumber` / `work_order_number`, "4865-1") to find the real UUID. This is a two-step read-then-write a caller has to know to do; nothing currently surfaces it proactively, since `list_endpoints`/`describe_endpoint` only carry `method`/`path`/`operationId`/`summary`/`tag` (see `RawOperation` in `catalogGen.ts`), not parameter schemas. AppFolio's own 400 message names the missing filter, so a capable caller can self-correct from the error alone, but the bracketed `filters[...]` syntax specifically is not guessable from that message.

## Bank Accounts

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/bank_accounts` | `getBankAccounts` | List All Bank Accounts | READ |
| POST | `/bank_accounts/bulk` | `bulkCreateBankAccounts` | Bulk Create Bank Accounts | DESTRUCTIVE |

## Bank Adjustments

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/bank_adjustments/bulk` | `bulkBankAdjustments` | Bulk Create Bank Adjustments | DESTRUCTIVE |

## Bank Statements

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/bank_statements/bulk` | `bulkCreateBankStatements` | Bulk Create Bank Statements | DESTRUCTIVE |

## Bills

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/bills` | `getBills` | List All Bills | READ |
| POST | `/bills` | `createBill` | Create Bill | WRITE |
| PATCH | `/bills/{billId}` | `updateBill` | Update Bill | WRITE |
| POST | `/bills/{BillId}/attachments` | `createBillAttachment` | Create Bill Attachment | WRITE |
| POST | `/bills/bulk` | `bulkCreateBill` | Bulk Create Bills | DESTRUCTIVE |

## Charges

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/charges` | `getCharges` | List All Charges | READ |
| POST | `/charges` | `createCharge` | Create Charges | WRITE |
| POST | `/charges/{ChargeId}/attachments` | `createChargeAttachment` | Create Charge Attachment | WRITE |
| POST | `/charges/bulk` | `bulkCreateCharge` | Bulk Create Charges | DESTRUCTIVE |

## Community Association Bank Balances

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/bank_balances` | `getCaBankBalances` | List All Community Association Bank Account Balances | READ |

## Community Association Board Members

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/board_members` | `getCaBoardMembers` | List All Community Association Board Members | READ |

## Community Association Homeowner Ledgers

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/homeowner_ledgers` | `getCaHomeownerLedgers` | List All Community Association Homeowner Ledgers | READ |

## Community Association Homeowners

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/homeowners` | `getCaHomeowners` | List All Community Association Homeowners | READ |

## Community Association Renters

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/renters` | `getCaRenters` | List All Community Association Renters | READ |

## Community Association Rules

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/rules` | `getCaRules` | List All Community Association Rules | READ |

## Community Association Units

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/units` | `getCaUnits` | List All Community Association Units | READ |

## Community Association Violations

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/violations` | `getCaViolations` | List All Community Association Violations | READ |
| POST | `/ca/violations` | `createCaViolation` | Create Community Association Violations  | WRITE |
| PATCH | `/ca/violations/{violationId}` | `updateCaViolation` | Update Community Association Violations | WRITE |
| POST | `/ca/violations/{violationId}/attachments` | `createCaViolationAttachment` | Create Community Association Violations Attachment | WRITE |

## Community Associations

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/ca/associations` | `getCommunityAssociations` | List All Community Associations | READ |

## Corporate Entities

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/corporate_entities` | `getCorporateEntities` | List All Corporate Entities | READ |

## Corporate General Ledger Accounts

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/corporate/gl_accounts/bulk` | `bulkCreateCorporateGlAccounts` | Bulk Create Corporate General Ledger Accounts | DESTRUCTIVE |

## Custom Fields

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/custom_fields` | `getCustomFields` | List All Custom Fields | READ |

## Delinquent Charges

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/delinquent_charges` | `getDelinquentCharges` | List All Delinquent Charges | READ |

## General Ledger Accounts

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/gl_accounts` | `getGlAccounts` | List All General Ledger Accounts | READ |
| POST | `/gl_accounts/bulk` | `bulkCreateGlAccounts` | Bulk Create General Ledger Accounts | DESTRUCTIVE |

## General Ledger Details

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/gl_details` | `getGlDetail` | List All General Ledger Details | READ |

## Inspections

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/inspections` | `createInspection` | Create Inspection | WRITE |
| DELETE | `/inspections/{InspectionId}` | `deleteInspection` | Delete Inspection | DESTRUCTIVE |
| PATCH | `/inspections/{InspectionId}` | `updateInspection` | Update Inspection | WRITE |
| POST | `/inspections/{InspectionId}/attachments` | `createInspectionAttachment` | Create Inspection Attachment | WRITE |
| POST | `/inspections/bulk` | `bulkCreateInspections` | Bulk Create Inspections | DESTRUCTIVE |

## Inventory Locations

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/inventory_locations` | `getInventoryLocations` | List All Inventory Locations | READ |

## Jobs

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/jobs` | `getjobs` | List All Jobs | READ |

## Journal Entries

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/journal_entries` | `getJournalEntries` | List All Journal Entries | READ |
| POST | `/journal_entries` | `createJournalEntry` | Create Journal Entries | WRITE |
| PATCH | `/journal_entries/{JournalEntryId}` | `updateJournalEntry` | Update Journal Entries | WRITE |
| POST | `/journal_entries/{JournalEntryId}/attachments` | `createJournalEntryAttachment` | Create Journal Entry Attachment | WRITE |
| POST | `/journal_entries/bulk` | `bulkCreateJournalEntries` | Bulk Create Journal Entries | DESTRUCTIVE |

## Late Fee Policies

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/late_fee_policies` | `getLateFeePolicies` | List All Late Fee Policies | READ |
| POST | `/late_fee_policies/bulk` | `bulkCreateLateFeePolicies` | Bulk Create Late Fee Policies | DESTRUCTIVE |

## Leads

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/leads` | `getLeads` | List All Leads | READ |
| POST | `/leads` | `createLead` | Create Leads | WRITE |
| POST | `/leads/{GuestCardId}/notes` | `createLeadNote` | Create Lead Note | WRITE |
| PATCH | `/leads/{GuestCardId}/notes/{Id}` | `updateLeadNote` | Update Lead Note | WRITE |
| PATCH | `/leads/{leadId}` | `updateLead` | Update Lead | WRITE |
| GET | `/leads/notes` | `getLeadsNotes` | List All Leads Notes | READ |

## Leases

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/leases` | `getLeases` | List All Leases | READ |
| GET | `/leases/renewal_pricings` | `getLeaseRenewalPricings` | List All Lease Renewal Pricings | READ |
| PUT | `/leases/renewal_pricings/bulk` | `putBulkLeaseRenewalPricings` | Bulk Put Lease Renewal Pricings | DESTRUCTIVE |

## Listings

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/listings` | `getListings` | List All Listings | READ |

## Mailing Letters

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/mailing_letter` | `getMailingLetters` | List Mailing Letters | READ |
| PATCH | `/mailing_letter/{mailingLetterId}` | `updateMailingLetter` | Update Mailing Letter | WRITE |
| PATCH | `/mailing_letter/bulk_update` | `bulkUpdateMailingLetter` | Bulk Update Mailing Letters | DESTRUCTIVE |

## Occupancies

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/occupancies/{OccupancyId}/attachments` | `createOccupancyAttachment` | Create Occupancy Attachment | WRITE |
| GET | `/occupancies/documents` | `getOccupancyDocuments` | List All Occupancies Documents | READ |

## Owner Groups

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/owner_groups` | `getOwnerGroups` | List All Owner Groups | READ |
| POST | `/owner_groups` | `createOwnerGroup` | Create Owner Group | WRITE |
| PATCH | `/owner_groups/{id}` | `updateOwnerGroup` | Update Owner Group | WRITE |

## Owners

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/owners` | `getOwners` | List All Owners | READ |
| POST | `/owners` | `createOwner` | Create Owner | WRITE |
| GET | `/owners/{ownerId}` | `getOwner` | Fetch an Owner by ID | READ |
| PATCH | `/owners/{ownerId}` | `updateOwner` | Update Owner | WRITE |
| POST | `/owners/{OwnerId}/attachments` | `createOwnerAttachment` | Create Owner Attachment | WRITE |
| POST | `/owners/{OwnerId}/notes` | `createOwnerNote` | Create Owner Note | WRITE |
| PATCH | `/owners/{OwnerId}/notes/{Id}` | `updateOwnerNote` | Update Owner Note | WRITE |
| GET | `/owners/attachments` | `listOwnerAttachments` | List All Owner Attachments | READ |
| POST | `/owners/bulk` | `bulkCreateOwners` | Bulk Create Owners | DESTRUCTIVE |
| GET | `/owners/notes` | `getOwnersNotes` | List All Owners Notes | READ |

## Payables

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/payables` | `getPayables` | List All Payables | READ |

## Portfolios

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/portfolios` | `getPortfolios` | List All Portfolios | READ |
| PATCH | `/portfolios/{portfolioId}` | `updatePortfolio` | Update a Portfolio | WRITE |

## Prepayments

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/prepayments/bulk` | `bulkCreatePrepayments` | Bulk Create Prepayments | DESTRUCTIVE |

## Properties

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/properties` | `getProperties` | List All Properties | READ |
| PATCH | `/properties/{propertyId}` | `updateProperty` | Update Property | WRITE |
| POST | `/properties/{PropertyId}/attachments` | `createPropertyAttachment` | Create Property Attachment | WRITE |
| POST | `/properties/{PropertyId}/marketing_photos` | `createPropertyMarketingPhoto` | Create Property Marketing Photo | WRITE |
| DELETE | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `deletePropertyMarketingPhoto` | Delete Property Marketing Photo | DESTRUCTIVE |
| PATCH | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `updatePropertyMarketingPhoto` | Update Property Marketing Photo | WRITE |
| POST | `/properties/{PropertyId}/notes` | `createpropertyNote` | Create Property Note | WRITE |
| PATCH | `/properties/{PropertyId}/notes/{Id}` | `updatepropertyNote` | Update Property Note | WRITE |
| POST | `/properties/{PropertyId}/photos` | `createPropertyPhoto` | Create Property Photo | WRITE |
| DELETE | `/properties/{PropertyId}/photos/{PhotoId}` | `deletePropertyPhoto` | Delete Property Photo | DESTRUCTIVE |
| PATCH | `/properties/{PropertyId}/photos/{PhotoId}` | `updatepropertyPhoto` | Update Property Photo | WRITE |
| GET | `/properties/attachments` | `listPropertyAttachments` | List All Property Attachments | READ |
| POST | `/properties/bulk` | `bulkCreateProperties` | Bulk Create Properties | DESTRUCTIVE |
| GET | `/properties/marketing_photos` | `getPropertiesMarketingPhotos` | List All Properties Marketing Photos | READ |
| GET | `/properties/notes` | `getPropertiesNotes` | List All Properties Notes | READ |
| GET | `/properties/photos` | `getPropertiesPhotos` | List All Properties Photos | READ |

## Property Groups

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/property_groups` | `getPropertyGroups` | List All Property Groups | READ |
| PATCH | `/property_groups/{propertyGroupId}` | `updatePropertyGroup` | Update a Property Group | WRITE |

## Recurring Charges

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/recurring_charges` | `getRecurringCharges` | List All Recurring Charges | READ |
| POST | `/recurring_charges` | `createRecurringCharges` | Create Recurring Charges | WRITE |
| PATCH | `/recurring_charges/{recurringChargeId}` | `updateRecurringCharge` | Update Recurring Charges | WRITE |

## Rental Applications

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/rental_applications` | `getRentalApplications` | List All Rental Applications | READ |
| PATCH | `/rental_applications/{rentalApplicationId}` | `updateRentalApplication` | Update Rental Application | WRITE |
| POST | `/rental_applications/{RentalApplicationId}/attachments` | `createRentalApplicationAttachment` | Create Rental Application Attachment | WRITE |
| POST | `/rental_applications/{RentalApplicationId}/notes` | `createRentalApplicationNote` | Create Rental Application Note | WRITE |
| PATCH | `/rental_applications/{RentalApplicationId}/notes/{Id}` | `updateRentalApplicationNote` | Update Rental Application Note | WRITE |
| GET | `/rental_applications/notes` | `getRentalApplicationsNotes` | List All Rental Applications Notes | READ |

## Security Deposits

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/security_deposits/bulk` | `bulkCreateSecurityDeposits` | Bulk Create Security Deposits | DESTRUCTIVE |

## Showings

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/showings` | `getShowings` | List All Showings | READ |
| POST | `/showings` | `createShowing` | Create Showings | WRITE |
| PATCH | `/showings/{showingId}` | `updateShowing` | Update Showing | WRITE |

## Tenant Ledgers

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/tenant_ledgers` | `getTenantLedgers` | List All Tenant Ledgers | READ |

## Tenants

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/tenants` | `getTenants` | List All Tenants | READ |
| PATCH | `/tenants/{tenantId}` | `updateTenant` | Update Tenant | WRITE |
| POST | `/tenants/{TenantId}/notes` | `createTenantNote` | Create Tenant Note | WRITE |
| PATCH | `/tenants/{TenantId}/notes/{Id}` | `updateTenantNote` | Update Tenant Note | WRITE |
| PATCH | `/tenants/bulk` | `bulkUpdateTenants` | Bulk Update Tenants | DESTRUCTIVE |
| POST | `/tenants/bulk` | `bulkCreateTenants` | Bulk Create Tenants | DESTRUCTIVE |
| GET | `/tenants/notes` | `getTenantsNotes` | List All Tenants Notes | READ |

## Unit Types

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/unit_types` | `getUnitTypes` | List All Unit Types | READ |
| PATCH | `/unit_types/{unitTypeId}` | `updateUnitType` | Update Unit Type | WRITE |
| POST | `/unit_types/bulk` | `bulkCreateUnitTypes` | Bulk Create Unit Types | DESTRUCTIVE |

## Units

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/units` | `getUnits` | List All Units | READ |
| PATCH | `/units/{unitId}` | `updateUnit` | Update Unit | WRITE |
| POST | `/units/{UnitId}/attachments` | `createUnitAttachment` | Create Unit Attachment | WRITE |
| POST | `/units/{UnitId}/notes` | `createUnitNote` | Create Unit Note | WRITE |
| PATCH | `/units/{UnitId}/notes/{Id}` | `updateUnitNote` | Update Unit Note | WRITE |
| POST | `/units/{UnitId}/photos` | `createUnitPhoto` | Create Unit Photo | WRITE |
| DELETE | `/units/{UnitId}/photos/{PhotoId}` | `deleteUnitPhoto` | Delete Unit Photo | DESTRUCTIVE |
| PATCH | `/units/{UnitId}/photos/{PhotoId}` | `updateUnitPhoto` | Update Unit Photo | WRITE |
| PUT | `/units/{UnitId}/pricing_matrices` | `putUnitPricingMatrix` | Put Unit Pricing Matrix | WRITE |
| GET | `/units/attachments` | `listUnitAttachments` | List All Unit Attachments | READ |
| POST | `/units/bulk` | `bulkCreateUnits` | Bulk Create Units | DESTRUCTIVE |
| GET | `/units/notes` | `getUnitsNotes` | List All Units Notes | READ |
| GET | `/units/photos` | `getUnitsPhotos` | List All Units Photos | READ |
| PUT | `/units/pricing_matrices/bulk` | `putBulkUnitPricingMatrix` | Bulk Put Unit Pricing Matrix | DESTRUCTIVE |
| PUT | `/units/pricing_matrices/bulk/async` | `putBulkUnitPricingMatrixAsync` | Bulk Put Unit Pricing Matrix (Async) | DESTRUCTIVE |

## Users

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/users` | `getUsers` | List All Users | READ |

## Vendors

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/vendors` | `getVendors` | List All Vendors | READ |
| POST | `/vendors` | `createVendor` | Create Vendor | WRITE |
| PATCH | `/vendors/{vendorId}` | `updateVendor` | Update Vendor | WRITE |
| POST | `/vendors/{VendorId}/notes` | `createVendorNote` | Create Vendor Note | WRITE |
| PATCH | `/vendors/{VendorId}/notes/{Id}` | `updateVendorNote` | Update Vendor Note | WRITE |
| POST | `/vendors/bulk` | `bulkCreateVendors` | Bulk Create Vendors | DESTRUCTIVE |
| GET | `/vendors/notes` | `getVendorsNotes` | List All Vendors Notes | READ |

## Work Orders

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/work_orders` | `getWorkOrders` | List All Work Orders | READ |
| POST | `/work_orders` | `createWorkOrder` | Create Work Orders | WRITE |
| PATCH | `/work_orders/{workOrderId}` | `updateWorkOrder` | Update Work Order | WRITE |
| POST | `/work_orders/{WorkOrderId}/attachments` | `createWorkOrderAttachment` | Create Work Order Attachment | WRITE |
| DELETE | `/work_orders/{WorkOrderId}/attachments/{AttachmentId}` | `deleteWorkOrderAttachment` | Delete Work Order Attachment | DESTRUCTIVE |
| POST | `/work_orders/{WorkOrderId}/notes` | `createWorkOrderNote` | Create Work Order Note | WRITE |
| PATCH | `/work_orders/{WorkOrderId}/notes/{Id}` | `updateWorkOrderNote` | Update Work Order Note | WRITE |
| GET | `/work_orders/attachments` | `listWorkOrderAttachments` | List All Work Order Attachments | READ |
