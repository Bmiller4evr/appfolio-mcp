# AppFolio Database API — Endpoint × Role Scope

Every operation in the Database API (151 total), classified by which role can reach it.

**Roles:** `owner` (Justin) — full read, narrow additive writes. `admin` (Bret) — full read, full non-destructive write, plus the destructive flag.

**Totals:**

- owner + admin: 77
- admin-only, requires ENABLE_DESTRUCTIVE: 28
- admin-only: 46

---

## Bank Accounts

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/bank_accounts` | `getBankAccounts` | List All Bank Accounts | READ | owner + admin | owner + admin |
| POST | `/bank_accounts/bulk` | `bulkCreateBankAccounts` | Bulk Create Bank Accounts | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Bank Adjustments

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/bank_adjustments/bulk` | `bulkBankAdjustments` | Bulk Create Bank Adjustments | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Bank Statements

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/bank_statements/bulk` | `bulkCreateBankStatements` | Bulk Create Bank Statements | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Bills

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/bills` | `getBills` | List All Bills | READ | owner + admin | owner + admin |
| POST | `/bills` | `createBill` | Create Bill | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/bills/{billId}` | `updateBill` | Update Bill | WRITE | admin-only | owner (disabled) + admin |
| POST | `/bills/{BillId}/attachments` | `createBillAttachment` | Create Bill Attachment | WRITE | admin-only | owner (disabled) + admin |
| POST | `/bills/bulk` | `bulkCreateBill` | Bulk Create Bills | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Charges

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/charges` | `getCharges` | List All Charges | READ | owner + admin | owner + admin |
| POST | `/charges` | `createCharge` | Create Charges | WRITE | admin-only | owner (disabled) + admin |
| POST | `/charges/bulk` | `bulkCreateCharge` | Bulk Create Charges | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| POST | `/charges/{ChargeId}/attachments` | `createChargeAttachment` | Create Charge Attachment | WRITE | admin-only | owner (disabled) + admin |

## Community Association Bank Balances

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/bank_balances` | `getCaBankBalances` | List All Community Association Bank Account Balances | READ | owner + admin | owner + admin |

## Community Association Board Members

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/board_members` | `getCaBoardMembers` | List All Community Association Board Members | READ | owner + admin | owner + admin |

## Community Association Homeowner Ledgers

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/homeowner_ledgers` | `getCaHomeownerLedgers` | List All Community Association Homeowner Ledgers | READ | owner + admin | owner + admin |

## Community Association Homeowners

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/homeowners` | `getCaHomeowners` | List All Community Association Homeowners | READ | owner + admin | owner + admin |

## Community Association Renters

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/renters` | `getCaRenters` | List All Community Association Renters | READ | owner + admin | owner + admin |

## Community Association Rules

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/rules` | `getCaRules` | List All Community Association Rules | READ | owner + admin | owner + admin |

## Community Association Units

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/units` | `getCaUnits` | List All Community Association Units | READ | owner + admin | owner + admin |

## Community Association Violations

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/violations` | `getCaViolations` | List All Community Association Violations | READ | owner + admin | owner + admin |
| POST | `/ca/violations` | `createCaViolation` | Create Community Association Violations  | WRITE | admin-only | owner (disabled) + admin |
| POST | `/ca/violations/{violationId}/attachments` | `createCaViolationAttachment` | Create Community Association Violations Attachment | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/ca/violations/{violationId}` | `updateCaViolation` | Update Community Association Violations | WRITE | admin-only | owner (disabled) + admin |

## Community Associations

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/ca/associations` | `getCommunityAssociations` | List All Community Associations | READ | owner + admin | owner + admin |

## Corporate Entities

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/corporate_entities` | `getCorporateEntities` | List All Corporate Entities | READ | owner + admin | owner + admin |

## Corporate General Ledger Accounts

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/corporate/gl_accounts/bulk` | `bulkCreateCorporateGlAccounts` | Bulk Create Corporate General Ledger Accounts | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Custom Fields

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/custom_fields` | `getCustomFields` | List All Custom Fields | READ | owner + admin | owner + admin |

## Delinquent Charges

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/delinquent_charges` | `getDelinquentCharges` | List All Delinquent Charges | READ | owner + admin | owner + admin |

## General Ledger Accounts

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/gl_accounts` | `getGlAccounts` | List All General Ledger Accounts | READ | owner + admin | owner + admin |
| POST | `/gl_accounts/bulk` | `bulkCreateGlAccounts` | Bulk Create General Ledger Accounts | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## General Ledger Details

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/gl_details` | `getGlDetail` | List All General Ledger Details | READ | owner + admin | owner + admin |

## Inspections

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/inspections/{InspectionId}/attachments` | `createInspectionAttachment` | Create Inspection Attachment | WRITE | owner + admin | owner + admin |
| POST | `/inspections` | `createInspection` | Create Inspection | WRITE | owner + admin | owner + admin |
| POST | `/inspections/bulk` | `bulkCreateInspections` | Bulk Create Inspections | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PATCH | `/inspections/{InspectionId}` | `updateInspection` | Update Inspection | WRITE | owner + admin | owner + admin |
| DELETE | `/inspections/{InspectionId}` | `deleteInspection` | Delete Inspection | DESTRUCTIVE (delete) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Inventory Locations

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/inventory_locations` | `getInventoryLocations` | List All Inventory Locations | READ | owner + admin | owner + admin |

## Jobs

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/jobs` | `getjobs` | List All Jobs | READ | owner + admin | owner + admin |

## Journal Entries

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/journal_entries` | `getJournalEntries` | List All Journal Entries | READ | owner + admin | owner + admin |
| POST | `/journal_entries` | `createJournalEntry` | Create Journal Entries | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/journal_entries/{JournalEntryId}` | `updateJournalEntry` | Update Journal Entries | WRITE | admin-only | owner (disabled) + admin |
| POST | `/journal_entries/bulk` | `bulkCreateJournalEntries` | Bulk Create Journal Entries | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| POST | `/journal_entries/{JournalEntryId}/attachments` | `createJournalEntryAttachment` | Create Journal Entry Attachment | WRITE | admin-only | owner (disabled) + admin |

## Late Fee Policies

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/late_fee_policies` | `getLateFeePolicies` | List All Late Fee Policies | READ | owner + admin | owner + admin |
| POST | `/late_fee_policies/bulk` | `bulkCreateLateFeePolicies` | Bulk Create Late Fee Policies | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Leads

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/leads` | `getLeads` | List All Leads | READ | owner + admin | owner + admin |
| POST | `/leads` | `createLead` | Create Leads | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/leads/{leadId}` | `updateLead` | Update Lead | WRITE | admin-only | owner (disabled) + admin |
| GET | `/leads/notes` | `getLeadsNotes` | List All Leads Notes | READ | owner + admin | owner + admin |
| POST | `/leads/{GuestCardId}/notes` | `createLeadNote` | Create Lead Note | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/leads/{GuestCardId}/notes/{Id}` | `updateLeadNote` | Update Lead Note | WRITE | admin-only | owner (disabled) + admin |

## Leases

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/leases` | `getLeases` | List All Leases | READ | owner + admin | owner + admin |
| GET | `/leases/renewal_pricings` | `getLeaseRenewalPricings` | List All Lease Renewal Pricings | READ | owner + admin | owner + admin |
| PUT | `/leases/renewal_pricings/bulk` | `putBulkLeaseRenewalPricings` | Bulk Put Lease Renewal Pricings | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Listings

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/listings` | `getListings` | List All Listings | READ | owner + admin | owner + admin |

## Mailing Letters

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/mailing_letter` | `getMailingLetters` | List Mailing Letters | READ | owner + admin | owner + admin |
| PATCH | `/mailing_letter/{mailingLetterId}` | `updateMailingLetter` | Update Mailing Letter | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/mailing_letter/bulk_update` | `bulkUpdateMailingLetter` | Bulk Update Mailing Letters | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Occupancies

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/occupancies/{OccupancyId}/attachments` | `createOccupancyAttachment` | Create Occupancy Attachment | WRITE | admin-only | owner (disabled) + admin |
| GET | `/occupancies/documents` | `getOccupancyDocuments` | List All Occupancies Documents | READ | owner + admin | owner + admin |

## Owner Groups

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/owner_groups` | `getOwnerGroups` | List All Owner Groups | READ | owner + admin | owner + admin |
| POST | `/owner_groups` | `createOwnerGroup` | Create Owner Group | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/owner_groups/{id}` | `updateOwnerGroup` | Update Owner Group | WRITE | admin-only | owner (disabled) + admin |

## Owners

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/owners` | `getOwners` | List All Owners | READ | owner + admin | owner + admin |
| POST | `/owners` | `createOwner` | Create Owner | WRITE | admin-only | owner (disabled) + admin |
| GET | `/owners/{ownerId}` | `getOwner` | Fetch an Owner by ID | READ | owner + admin | owner + admin |
| PATCH | `/owners/{ownerId}` | `updateOwner` | Update Owner | WRITE | admin-only | owner (disabled) + admin |
| POST | `/owners/bulk` | `bulkCreateOwners` | Bulk Create Owners | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| POST | `/owners/{OwnerId}/attachments` | `createOwnerAttachment` | Create Owner Attachment | WRITE | admin-only | owner (disabled) + admin |
| GET | `/owners/attachments` | `listOwnerAttachments` | List All Owner Attachments | READ | owner + admin | owner + admin |
| GET | `/owners/notes` | `getOwnersNotes` | List All Owners Notes | READ | owner + admin | owner + admin |
| POST | `/owners/{OwnerId}/notes` | `createOwnerNote` | Create Owner Note | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/owners/{OwnerId}/notes/{Id}` | `updateOwnerNote` | Update Owner Note | WRITE | admin-only | owner (disabled) + admin |

## Payables

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/payables` | `getPayables` | List All Payables | READ | owner + admin | owner + admin |

## Portfolios

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/portfolios` | `getPortfolios` | List All Portfolios | READ | owner + admin | owner + admin |
| PATCH | `/portfolios/{portfolioId}` | `updatePortfolio` | Update a Portfolio | WRITE | admin-only | owner (disabled) + admin |

## Prepayments

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/prepayments/bulk` | `bulkCreatePrepayments` | Bulk Create Prepayments | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Properties

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/properties` | `getProperties` | List All Properties | READ | owner + admin | owner + admin |
| POST | `/properties/bulk` | `bulkCreateProperties` | Bulk Create Properties | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PATCH | `/properties/{propertyId}` | `updateProperty` | Update Property | WRITE | admin-only | owner (disabled) + admin |
| GET | `/properties/attachments` | `listPropertyAttachments` | List All Property Attachments | READ | owner + admin | owner + admin |
| POST | `/properties/{PropertyId}/attachments` | `createPropertyAttachment` | Create Property Attachment | WRITE | admin-only | owner (disabled) + admin |
| GET | `/properties/notes` | `getPropertiesNotes` | List All Properties Notes | READ | owner + admin | owner + admin |
| POST | `/properties/{PropertyId}/notes` | `createpropertyNote` | Create Property Note | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/properties/{PropertyId}/notes/{Id}` | `updatepropertyNote` | Update Property Note | WRITE | admin-only | owner (disabled) + admin |
| GET | `/properties/marketing_photos` | `getPropertiesMarketingPhotos` | List All Properties Marketing Photos | READ | owner + admin | owner + admin |
| PATCH | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `updatePropertyMarketingPhoto` | Update Property Marketing Photo | WRITE | admin-only | owner (disabled) + admin |
| DELETE | `/properties/{PropertyId}/marketing_photos/{MarketingPhotoId}` | `deletePropertyMarketingPhoto` | Delete Property Marketing Photo | DESTRUCTIVE (delete) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| GET | `/properties/photos` | `getPropertiesPhotos` | List All Properties Photos | READ | owner + admin | owner + admin |
| POST | `/properties/{PropertyId}/marketing_photos` | `createPropertyMarketingPhoto` | Create Property Marketing Photo | WRITE | admin-only | owner (disabled) + admin |
| POST | `/properties/{PropertyId}/photos` | `createPropertyPhoto` | Create Property Photo | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/properties/{PropertyId}/photos/{PhotoId}` | `updatepropertyPhoto` | Update Property Photo | WRITE | admin-only | owner (disabled) + admin |
| DELETE | `/properties/{PropertyId}/photos/{PhotoId}` | `deletePropertyPhoto` | Delete Property Photo | DESTRUCTIVE (delete) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Property Groups

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/property_groups` | `getPropertyGroups` | List All Property Groups | READ | owner + admin | owner + admin |
| PATCH | `/property_groups/{propertyGroupId}` | `updatePropertyGroup` | Update a Property Group | WRITE | admin-only | owner (disabled) + admin |

## Recurring Charges

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/recurring_charges` | `getRecurringCharges` | List All Recurring Charges | READ | owner + admin | owner + admin |
| POST | `/recurring_charges` | `createRecurringCharges` | Create Recurring Charges | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/recurring_charges/{recurringChargeId}` | `updateRecurringCharge` | Update Recurring Charges | WRITE | admin-only | owner (disabled) + admin |

## Rental Applications

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/rental_applications/{RentalApplicationId}/attachments` | `createRentalApplicationAttachment` | Create Rental Application Attachment | WRITE | admin-only | owner (disabled) + admin |
| GET | `/rental_applications` | `getRentalApplications` | List All Rental Applications | READ | owner + admin | owner + admin |
| PATCH | `/rental_applications/{rentalApplicationId}` | `updateRentalApplication` | Update Rental Application | WRITE | admin-only | owner (disabled) + admin |
| GET | `/rental_applications/notes` | `getRentalApplicationsNotes` | List All Rental Applications Notes | READ | owner + admin | owner + admin |
| POST | `/rental_applications/{RentalApplicationId}/notes` | `createRentalApplicationNote` | Create Rental Application Note | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/rental_applications/{RentalApplicationId}/notes/{Id}` | `updateRentalApplicationNote` | Update Rental Application Note | WRITE | admin-only | owner (disabled) + admin |

## Security Deposits

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| POST | `/security_deposits/bulk` | `bulkCreateSecurityDeposits` | Bulk Create Security Deposits | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Showings

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/showings` | `getShowings` | List All Showings | READ | owner + admin | owner + admin |
| POST | `/showings` | `createShowing` | Create Showings | WRITE | admin-only | owner (disabled) + admin |
| PATCH | `/showings/{showingId}` | `updateShowing` | Update Showing | WRITE | admin-only | owner (disabled) + admin |

## Tenant Ledgers

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/tenant_ledgers` | `getTenantLedgers` | List All Tenant Ledgers | READ | owner + admin | owner + admin |

## Tenants

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/tenants` | `getTenants` | List All Tenants | READ | owner + admin | owner + admin |
| PATCH | `/tenants/{tenantId}` | `updateTenant` | Update Tenant | WRITE | admin-only | owner (disabled) + admin |
| GET | `/tenants/notes` | `getTenantsNotes` | List All Tenants Notes | READ | owner + admin | owner + admin |
| POST | `/tenants/{TenantId}/notes` | `createTenantNote` | Create Tenant Note | WRITE | owner + admin | owner + admin |
| PATCH | `/tenants/{TenantId}/notes/{Id}` | `updateTenantNote` | Update Tenant Note | WRITE | owner + admin | owner + admin |
| POST | `/tenants/bulk` | `bulkCreateTenants` | Bulk Create Tenants | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PATCH | `/tenants/bulk` | `bulkUpdateTenants` | Bulk Update Tenants | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |

## Unit Types

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/unit_types` | `getUnitTypes` | List All Unit Types | READ | owner + admin | owner + admin |
| POST | `/unit_types/bulk` | `bulkCreateUnitTypes` | Bulk Create Unit Types | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PATCH | `/unit_types/{unitTypeId}` | `updateUnitType` | Update Unit Type | WRITE | admin-only | owner (disabled) + admin |

## Units

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/units` | `getUnits` | List All Units | READ | owner + admin | owner + admin |
| POST | `/units/bulk` | `bulkCreateUnits` | Bulk Create Units | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PUT | `/units/pricing_matrices/bulk` | `putBulkUnitPricingMatrix` | Bulk Put Unit Pricing Matrix | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PUT | `/units/pricing_matrices/bulk/async` | `putBulkUnitPricingMatrixAsync` | Bulk Put Unit Pricing Matrix (Async) | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| PATCH | `/units/{unitId}` | `updateUnit` | Update Unit | WRITE | admin-only | owner (disabled) + admin |
| PUT | `/units/{UnitId}/pricing_matrices` | `putUnitPricingMatrix` | Put Unit Pricing Matrix | WRITE | admin-only | owner (disabled) + admin |
| POST | `/units/{UnitId}/attachments` | `createUnitAttachment` | Create Unit Attachment | WRITE | owner + admin | owner + admin |
| GET | `/units/attachments` | `listUnitAttachments` | List All Unit Attachments | READ | owner + admin | owner + admin |
| GET | `/units/notes` | `getUnitsNotes` | List All Units Notes | READ | owner + admin | owner + admin |
| POST | `/units/{UnitId}/notes` | `createUnitNote` | Create Unit Note | WRITE | owner + admin | owner + admin |
| PATCH | `/units/{UnitId}/notes/{Id}` | `updateUnitNote` | Update Unit Note | WRITE | owner + admin | owner + admin |
| POST | `/units/{UnitId}/photos` | `createUnitPhoto` | Create Unit Photo | WRITE | owner + admin | owner + admin |
| PATCH | `/units/{UnitId}/photos/{PhotoId}` | `updateUnitPhoto` | Update Unit Photo | WRITE | owner + admin | owner + admin |
| DELETE | `/units/{UnitId}/photos/{PhotoId}` | `deleteUnitPhoto` | Delete Unit Photo | DESTRUCTIVE (delete) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| GET | `/units/photos` | `getUnitsPhotos` | List All Units Photos | READ | owner + admin | owner + admin |

## Users

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/users` | `getUsers` | List All Users | READ | owner + admin | owner + admin |

## Vendors

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/vendors` | `getVendors` | List All Vendors | READ | owner + admin | owner + admin |
| POST | `/vendors` | `createVendor` | Create Vendor | WRITE | owner + admin | owner + admin |
| PATCH | `/vendors/{vendorId}` | `updateVendor` | Update Vendor | WRITE | owner + admin | owner + admin |
| POST | `/vendors/bulk` | `bulkCreateVendors` | Bulk Create Vendors | DESTRUCTIVE (bulk) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| GET | `/vendors/notes` | `getVendorsNotes` | List All Vendors Notes | READ | owner + admin | owner + admin |
| POST | `/vendors/{VendorId}/notes` | `createVendorNote` | Create Vendor Note | WRITE | owner + admin | owner + admin |
| PATCH | `/vendors/{VendorId}/notes/{Id}` | `updateVendorNote` | Update Vendor Note | WRITE | owner + admin | owner + admin |

## Work Orders

| Method | Path | Operation ID | Summary | Class | Executable by | Discoverable by |
|---|---|---|---|---|---|---|
| GET | `/work_orders` | `getWorkOrders` | List All Work Orders | READ | owner + admin | owner + admin |
| POST | `/work_orders` | `createWorkOrder` | Create Work Orders | WRITE | owner + admin | owner + admin |
| GET | `/work_orders/attachments` | `listWorkOrderAttachments` | List All Work Order Attachments | READ | owner + admin | owner + admin |
| PATCH | `/work_orders/{workOrderId}` | `updateWorkOrder` | Update Work Order | WRITE | owner + admin | owner + admin |
| POST | `/work_orders/{WorkOrderId}/attachments` | `createWorkOrderAttachment` | Create Work Order Attachment | WRITE | owner + admin | owner + admin |
| DELETE | `/work_orders/{WorkOrderId}/attachments/{AttachmentId}` | `deleteWorkOrderAttachment` | Delete Work Order Attachment | DESTRUCTIVE (delete) | admin-only, requires ENABLE_DESTRUCTIVE | admin only |
| POST | `/work_orders/{WorkOrderId}/notes` | `createWorkOrderNote` | Create Work Order Note | WRITE | owner + admin | owner + admin |
| PATCH | `/work_orders/{WorkOrderId}/notes/{Id}` | `updateWorkOrderNote` | Update Work Order Note | WRITE | owner + admin | owner + admin |

