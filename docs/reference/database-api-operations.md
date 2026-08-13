# AppFolio Database API (v0) — Operation Reference

Generated from `database_api_March_1_2026.html` (Redocly export, embedded OpenAPI 3.0 spec).

**Base URL:** `https://api.appfolio.com/api/v0`
**Auth:** HTTP Basic + `X-AppFolio-Developer-ID` header (Developer Space credentials)

**Totals:** 151 operations across 48 tags — 58 READ, 65 WRITE, 5 DELETE, 23 BULK.

## Tag index

- [Bank Accounts](#bank-accounts) — 2 ops (1 mutating)
- [Bank Adjustments](#bank-adjustments) — 1 ops (1 mutating)
- [Bank Statements](#bank-statements) — 1 ops (1 mutating)
- [Bills](#bills) — 5 ops (4 mutating)
- [Charges](#charges) — 4 ops (3 mutating)
- [Community Association Bank Balances](#community-association-bank-balances) — 1 ops (0 mutating)
- [Community Association Board Members](#community-association-board-members) — 1 ops (0 mutating)
- [Community Association Homeowner Ledgers](#community-association-homeowner-ledgers) — 1 ops (0 mutating)
- [Community Association Homeowners](#community-association-homeowners) — 1 ops (0 mutating)
- [Community Association Renters](#community-association-renters) — 1 ops (0 mutating)
- [Community Association Rules](#community-association-rules) — 1 ops (0 mutating)
- [Community Association Units](#community-association-units) — 1 ops (0 mutating)
- [Community Association Violations](#community-association-violations) — 4 ops (3 mutating)
- [Community Associations](#community-associations) — 1 ops (0 mutating)
- [Corporate Entities](#corporate-entities) — 1 ops (0 mutating)
- [Corporate General Ledger Accounts](#corporate-general-ledger-accounts) — 1 ops (1 mutating)
- [Custom Fields](#custom-fields) — 1 ops (0 mutating)
- [Delinquent Charges](#delinquent-charges) — 1 ops (0 mutating)
- [General Ledger Accounts](#general-ledger-accounts) — 2 ops (1 mutating)
- [General Ledger Details](#general-ledger-details) — 1 ops (0 mutating)
- [Inspections](#inspections) — 5 ops (5 mutating)
- [Inventory Locations](#inventory-locations) — 1 ops (0 mutating)
- [Jobs](#jobs) — 1 ops (0 mutating)
- [Journal Entries](#journal-entries) — 5 ops (4 mutating)
- [Late Fee Policies](#late-fee-policies) — 2 ops (1 mutating)
- [Leads](#leads) — 6 ops (4 mutating)
- [Leases](#leases) — 3 ops (1 mutating)
- [Listings](#listings) — 1 ops (0 mutating)
- [Mailing Letters](#mailing-letters) — 3 ops (2 mutating)
- [Occupancies](#occupancies) — 2 ops (1 mutating)
- [Owner Groups](#owner-groups) — 3 ops (2 mutating)
- [Owners](#owners) — 10 ops (6 mutating)
- [Payables](#payables) — 1 ops (0 mutating)
- [Portfolios](#portfolios) — 2 ops (1 mutating)
- [Prepayments](#prepayments) — 1 ops (1 mutating)
- [Properties](#properties) — 16 ops (11 mutating)
- [Property Groups](#property-groups) — 2 ops (1 mutating)
- [Recurring Charges](#recurring-charges) — 3 ops (2 mutating)
- [Rental Applications](#rental-applications) — 6 ops (4 mutating)
- [Security Deposits](#security-deposits) — 1 ops (1 mutating)
- [Showings](#showings) — 3 ops (2 mutating)
- [Tenant Ledgers](#tenant-ledgers) — 1 ops (0 mutating)
- [Tenants](#tenants) — 7 ops (5 mutating)
- [Unit Types](#unit-types) — 3 ops (2 mutating)
- [Units](#units) — 15 ops (11 mutating)
- [Users](#users) — 1 ops (0 mutating)
- [Vendors](#vendors) — 7 ops (5 mutating)
- [Work Orders](#work-orders) — 8 ops (6 mutating)

---

## Bank Accounts

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/bank_accounts` | `getBankAccounts` | List All Bank Accounts | READ |
| POST | `/bank_accounts/bulk` | `bulkCreateBankAccounts` | Bulk Create Bank Accounts | DESTRUCTIVE (bulk) |

## Bank Adjustments

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/bank_adjustments/bulk` | `bulkBankAdjustments` | Bulk Create Bank Adjustments | DESTRUCTIVE (bulk) |

## Bank Statements

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/bank_statements/bulk` | `bulkCreateBankStatements` | Bulk Create Bank Statements | DESTRUCTIVE (bulk) |

## Bills

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/bills` | `getBills` | List All Bills | READ |
| POST | `/bills` | `createBill` | Create Bill | WRITE |
| PATCH | `/bills/{billId}` | `updateBill` | Update Bill | WRITE |
| POST | `/bills/{BillId}/attachments` | `createBillAttachment` | Create Bill Attachment | WRITE |
| POST | `/bills/bulk` | `bulkCreateBill` | Bulk Create Bills | DESTRUCTIVE (bulk) |

## Charges

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/charges` | `getCharges` | List All Charges | READ |
| POST | `/charges` | `createCharge` | Create Charges | WRITE |
| POST | `/charges/bulk` | `bulkCreateCharge` | Bulk Create Charges | DESTRUCTIVE (bulk) |
| POST | `/charges/{ChargeId}/attachments` | `createChargeAttachment` | Create Charge Attachment | WRITE |

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
| POST | `/ca/violations/{violationId}/attachments` | `createCaViolationAttachment` | Create Community Association Violations Attachment | WRITE |
| PATCH | `/ca/violations/{violationId}` | `updateCaViolation` | Update Community Association Violations | WRITE |

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
| POST | `/corporate/gl_accounts/bulk` | `bulkCreateCorporateGlAccounts` | Bulk Create Corporate General Ledger Accounts | DESTRUCTIVE (bulk) |

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
| POST | `/gl_accounts/bulk` | `bulkCreateGlAccounts` | Bulk Create General Ledger Accounts | DESTRUCTIVE (bulk) |

## General Ledger Details

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/gl_details` | `getGlDetail` | List All General Ledger Details | READ |

## Inspections

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/inspections/{InspectionId}/attachments` | `createInspectionAttachment` | Create Inspection Attachment | WRITE |
| POST | `/inspections` | `createInspection` | Create Inspection | WRITE |
| POST | `/inspections/bulk` | `bulkCreateInspections` | Bulk Create Inspections | DESTRUCTIVE (bulk) |
| PATCH | `/inspections/{InspectionId}` | `updateInspection` | Update Inspection | WRITE |
| DELETE | `/inspections/{InspectionId}` | `deleteInspection` | Delete Inspection | DESTRUCTIVE (delete) |

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
| POST | `/journal_entries/bulk` | `bulkCreateJournalEntries` | Bulk Create Journal Entries | DESTRUCTIVE (bulk) |
| POST | `/journal_entries/{JournalEntryId}/attachments` | `createJournalEntryAttachment` | Create Journal Entry Attachment | WRITE |

## Late Fee Policies

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/late_fee_policies` | `getLateFeePolicies` | List All Late Fee Policies | READ |
| POST | `/late_fee_policies/bulk` | `bulkCreateLateFeePolicies` | Bulk Create Late Fee Policies | DESTRUCTIVE (bulk) |

## Leads

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/leads` | `getLeads` | List All Leads | READ |
| POST | `/leads` | `createLead` | Create Leads | WRITE |
| PATCH | `/leads/{leadId}` | `updateLead` | Update Lead | WRITE |
| GET | `/leads/notes` | `getLeadsNotes` | List All Leads Notes | READ |
| POST | `/leads/{GuestCardId}/notes` | `createLeadNote` | Create Lead Note | WRITE |
| PATCH | `/leads/{GuestCardId}/notes/{Id}` | `updateLeadNote` | Update Lead Note | WRITE |

## Leases

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/leases` | `getLeases` | List All Leases | READ |
| GET | `/leases/renewal_pricings` | `getLeaseRenewalPricings` | List All Lease Renewal Pricings | READ |
| PUT | `/leases/renewal_pricings/bulk` | `putBulkLeaseRenewalPricings` | Bulk Put Lease Renewal Pricings | DESTRUCTIVE (bulk) |

## Listings

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/listings` | `getListings` | List All Listings | READ |

## Mailing Letters

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/mailing_letter` | `getMailingLetters` | List Mailing Letters | READ |
| PATCH | `/mailing_letter/{mailingLetterId}` | `updateMailingLetter` | Update Mailing Letter | WRITE |
| PATCH | `/mailing_letter/bulk_update` | `bulkUpdateMailingLetter` | Bulk Update Mailing Letters | DESTRUCTIVE (bulk) |

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
| POST | `/owners/bulk` | `bulkCreateOwners` | Bulk Create Owners | DESTRUCTIVE (bulk) |
| POST | `/owners/{OwnerId}/attachments` | `createOwnerAttachment` | Create Owner Attachment | WRITE |
| GET | `/owners/attachments` | `listOwnerAttachments` | List All Owner Attachments | READ |
| GET | `/owners/notes` | `getOwnersNotes` | List All Owners Notes | READ |
| POST | `/owners/{OwnerId}/notes` | `createOwnerNote` | Create Owner Note | WRITE |
| PATCH | `/owners/{OwnerId}/notes/{Id}` | `updateOwnerNote` | Update Owner Note | WRITE |

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
| POST | `/prepayments/bulk` | `bulkCreatePrepayments` | Bulk Create Prepayments | DESTRUCTIVE (bulk) |

## Properties

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/properties` | `getProperties` | List All Properties | READ |
| POST | `/properties/bulk` | `bulkCreateProperties` | Bulk Create Properties | DESTRUCTIVE (bulk) |
| PATCH | `/properties/{propertyId}` | `updateProperty` | Update Property | WRITE |
| GET | `/properties/attachments` | `listPropertyAttachments` | List All Property Attachments | READ |
| POST | `/properties/{PropertyId}/attachments` | `createPropertyAttachment` | Create Property Attachment | WRITE |
| GET | `/properties/notes` | `getPropertiesNotes` | List All Properties Notes | READ |
| POST | `/properties/{PropertyId}/notes` | `createpropertyNote` | Create Property Note | WRITE |
| PATCH | `/properties/{PropertyId}/notes/{Id}` | `updatepropertyNote` | Update Property Note | WRITE |
| GET | `/properties/marketing_photos` | `getPropertiesMarketingPhotos` | List All Properties Marketing Photos | READ |
| PATCH | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `updatePropertyMarketingPhoto` | Update Property Marketing Photo | WRITE |
| DELETE | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `deletePropertyMarketingPhoto` | Delete Property Marketing Photo | DESTRUCTIVE (delete) |
| GET | `/properties/photos` | `getPropertiesPhotos` | List All Properties Photos | READ |
| POST | `/properties/{PropertyId}/marketing_photos` | `createPropertyMarketingPhoto` | Create Property Marketing Photo | WRITE |
| POST | `/properties/{PropertyId}/photos` | `createPropertyPhoto` | Create Property Photo | WRITE |
| PATCH | `/properties/{PropertyId}/photos/{PhotoId}` | `updatepropertyPhoto` | Update Property Photo | WRITE |
| DELETE | `/properties/{PropertyId}/photos/{PhotoId}` | `deletePropertyPhoto` | Delete Property Photo | DESTRUCTIVE (delete) |

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
| POST | `/rental_applications/{RentalApplicationId}/attachments` | `createRentalApplicationAttachment` | Create Rental Application Attachment | WRITE |
| GET | `/rental_applications` | `getRentalApplications` | List All Rental Applications | READ |
| PATCH | `/rental_applications/{rentalApplicationId}` | `updateRentalApplication` | Update Rental Application | WRITE |
| GET | `/rental_applications/notes` | `getRentalApplicationsNotes` | List All Rental Applications Notes | READ |
| POST | `/rental_applications/{RentalApplicationId}/notes` | `createRentalApplicationNote` | Create Rental Application Note | WRITE |
| PATCH | `/rental_applications/{RentalApplicationId}/notes/{Id}` | `updateRentalApplicationNote` | Update Rental Application Note | WRITE |

## Security Deposits

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| POST | `/security_deposits/bulk` | `bulkCreateSecurityDeposits` | Bulk Create Security Deposits | DESTRUCTIVE (bulk) |

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
| GET | `/tenants/notes` | `getTenantsNotes` | List All Tenants Notes | READ |
| POST | `/tenants/{TenantId}/notes` | `createTenantNote` | Create Tenant Note | WRITE |
| PATCH | `/tenants/{TenantId}/notes/{Id}` | `updateTenantNote` | Update Tenant Note | WRITE |
| POST | `/tenants/bulk` | `bulkCreateTenants` | Bulk Create Tenants | DESTRUCTIVE (bulk) |
| PATCH | `/tenants/bulk` | `bulkUpdateTenants` | Bulk Update Tenants | DESTRUCTIVE (bulk) |

## Unit Types

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/unit_types` | `getUnitTypes` | List All Unit Types | READ |
| POST | `/unit_types/bulk` | `bulkCreateUnitTypes` | Bulk Create Unit Types | DESTRUCTIVE (bulk) |
| PATCH | `/unit_types/{unitTypeId}` | `updateUnitType` | Update Unit Type | WRITE |

## Units

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/units` | `getUnits` | List All Units | READ |
| POST | `/units/bulk` | `bulkCreateUnits` | Bulk Create Units | DESTRUCTIVE (bulk) |
| PUT | `/units/pricing_matrices/bulk` | `putBulkUnitPricingMatrix` | Bulk Put Unit Pricing Matrix | DESTRUCTIVE (bulk) |
| PUT | `/units/pricing_matrices/bulk/async` | `putBulkUnitPricingMatrixAsync` | Bulk Put Unit Pricing Matrix (Async) | DESTRUCTIVE (bulk) |
| PATCH | `/units/{unitId}` | `updateUnit` | Update Unit | WRITE |
| PUT | `/units/{UnitId}/pricing_matrices` | `putUnitPricingMatrix` | Put Unit Pricing Matrix | WRITE |
| POST | `/units/{UnitId}/attachments` | `createUnitAttachment` | Create Unit Attachment | WRITE |
| GET | `/units/attachments` | `listUnitAttachments` | List All Unit Attachments | READ |
| GET | `/units/notes` | `getUnitsNotes` | List All Units Notes | READ |
| POST | `/units/{UnitId}/notes` | `createUnitNote` | Create Unit Note | WRITE |
| PATCH | `/units/{UnitId}/notes/{Id}` | `updateUnitNote` | Update Unit Note | WRITE |
| POST | `/units/{UnitId}/photos` | `createUnitPhoto` | Create Unit Photo | WRITE |
| PATCH | `/units/{UnitId}/photos/{PhotoId}` | `updateUnitPhoto` | Update Unit Photo | WRITE |
| DELETE | `/units/{UnitId}/photos/{PhotoId}` | `deleteUnitPhoto` | Delete Unit Photo | DESTRUCTIVE (delete) |
| GET | `/units/photos` | `getUnitsPhotos` | List All Units Photos | READ |

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
| POST | `/vendors/bulk` | `bulkCreateVendors` | Bulk Create Vendors | DESTRUCTIVE (bulk) |
| GET | `/vendors/notes` | `getVendorsNotes` | List All Vendors Notes | READ |
| POST | `/vendors/{VendorId}/notes` | `createVendorNote` | Create Vendor Note | WRITE |
| PATCH | `/vendors/{VendorId}/notes/{Id}` | `updateVendorNote` | Update Vendor Note | WRITE |

## Work Orders

| Method | Path | Operation ID | Summary | Class |
|---|---|---|---|---|
| GET | `/work_orders` | `getWorkOrders` | List All Work Orders | READ |
| POST | `/work_orders` | `createWorkOrder` | Create Work Orders | WRITE |
| GET | `/work_orders/attachments` | `listWorkOrderAttachments` | List All Work Order Attachments | READ |
| PATCH | `/work_orders/{workOrderId}` | `updateWorkOrder` | Update Work Order | WRITE |
| POST | `/work_orders/{WorkOrderId}/attachments` | `createWorkOrderAttachment` | Create Work Order Attachment | WRITE |
| DELETE | `/work_orders/{WorkOrderId}/attachments/{AttachmentId}` | `deleteWorkOrderAttachment` | Delete Work Order Attachment | DESTRUCTIVE (delete) |
| POST | `/work_orders/{WorkOrderId}/notes` | `createWorkOrderNote` | Create Work Order Note | WRITE |
| PATCH | `/work_orders/{WorkOrderId}/notes/{Id}` | `updateWorkOrderNote` | Update Work Order Note | WRITE |

