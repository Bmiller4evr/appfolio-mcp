# AppFolio Reports API (V2) - Report Reference

Generated from the Reports API Redocly HTML export (110 report endpoints).

Base URL: https://{database}.appfolio.com/api/v2/reports/{report_id}
Auth: HTTP Basic (Reports API credentials, separate from the Database API pair)

Only vendor_directory and rent_roll have been verified with full column/filter detail in this project so far (see docs/composites/*.md and src/reports/operations.data.ts). delinquency and work_order are pending verification in later tasks. Every other report below is listed by name only, pending future verification if a composite needs it.

## All reports

| Report ID | Summary |
|---|---|
| `account_totals` | Account Totals |
| `additional_fees` | Additional Fees |
| `aged_payables_summary` | Aged Payables Summary |
| `aged_receivables_detail` | Aged Receivable Detail |
| `amenities_by_property` | Amenities By Property |
| `annual_budget_comparative` | Annual Budget - Comparative |
| `annual_budget_forecast` | Annual Budget - Forecast |
| `appfolio_stack_usage` | AppFolio Stack™ Usage |
| `automated_ap_usage_summary` | Automated AP Usage Summary |
| `balance_sheet` | Balance Sheet |
| `balance_sheet_comparative` | Balance Sheet - Comparative |
| `balance_sheet_comparison` | Balance Sheet - Property Comparison |
| `bank_account_association` | Bank Account Association |
| `bill_detail` | Bill Detail |
| `budget_comparative` | Budget - Comparative |
| `budget_comparison` | Budget - Property Comparison |
| `cash_flow` | Cash Flow |
| `cash_flow_comparison` | Cash Flow - Property Comparison |
| `cash_flow_detail` | Cash Flow Detail |
| `charge_detail` | Charge Detail |
| `chart_of_accounts` | Chart of Accounts |
| `check_register` | Check Register |
| `check_register_detail` | Check Register Detail (Enhanced) |
| `delinquency` | Delinquency |
| `delinquency_as_of` | Delinquency (As Of) |
| `deposit_register` | Deposit Register |
| `eligible_debt_summary` | Eligible Debt Summary |
| `email_delivery_errors` | Email Delivery Errors |
| `expense_distribution` | Expense Distribution |
| `expense_register` | Expense Register |
| `fixed_assets` | Fixed Assets |
| `general_ledger` | General Ledger |
| `gross_potential_rent_enhanced` | Gross Potential Rent |
| `guest_card_inquiries` | Guest Card Inquiries |
| `guest_cards` | Guest Card Interests |
| `import_variances` | Import Variances |
| `inactive_guest_cards` | Inactive Guest Card Interests |
| `income_register` | Income Register |
| `income_statement` | Income Statement |
| `income_statement_comparative` | Income Statement - Comparative |
| `income_statement_comparison` | Income Statement - Property Comparison |
| `income_statement_date_range` | Income Statement (Date Range) |
| `insurance_audit` | Insurance Audit |
| `insurance_usage` | Insurance Usage |
| `inventory_status` | Inventory Status |
| `inventory_usage` | Inventory Usage |
| `keys_detail` | Keys Detail |
| `late_fee_policy_comparison` | Late Fee Policy Comparison |
| `lease_expiration_detail` | Lease Expiration Detail By Month |
| `lease_expiration_summary` | Lease Expiration Summary By Month |
| `lease_history` | Lease History |
| `leasing_agent_performance` | Leasing Agent Performance |
| `leasing_funnel_performance` | Leasing Funnel Performance |
| `leasing_summary` | Leasing Summary |
| `lisa_unit_count` | Lisa Unit Count |
| `loans` | Loans |
| `occupancy_summary` | Occupancy Summary |
| `owner1099` | Owner 1099 Summary |
| `owner1099_detail` | Owner 1099 Detail |
| `owner_directory` | Owner Directory |
| `owner_leasing` | Owner Leasing |
| `owner_withholdings` | Owner Withholdings |
| `payment_plans` | Payment Plans |
| `premium_leads_activation_history` | Premium Listing Activation History |
| `premium_leads_billing_detail` | Premium Listing Billing Detail |
| `premium_leads_usage_summary` | Premium Listing Usage Summary |
| `project_budget_detail` | Project Budget Detail |
| `property_budget` | Property Budget |
| `property_directory` | Property Directory |
| `property_group_directory` | Property Group Directory |
| `property_performance` | Property Performance |
| `prospect_source_tracking` | Prospect Source Tracking |
| `purchase_order` | Purchase Order |
| `receivables_activity` | Receivables Activity |
| `renewal_summary` | Renewal Summary |
| `rent_roll` | Rent Roll |
| `rent_roll_commercial` | Rent Roll (Commercial) |
| `rent_roll_itemized` | Rent Roll (Itemized) |
| `rentable_items` | Rentable Items |
| `rental_applications` | Rental Applications |
| `resident_financial_activity` | Resident Financial Activity |
| `screening_assessments` | Screening Assessments |
| `screening_usage` | Screening Usage |
| `security_deposit_funds_detail` | Security Deposit Funds Detail |
| `showings` | Showings |
| `surveys_summary` | Survey Responses |
| `tenant_debt_collections_status` | Debt Collections Status |
| `tenant_directory` | Tenant Directory |
| `tenant_ledger` | Tenant Ledger |
| `tenant_tickler` | Tenant Tickler |
| `tenant_transactions_summary` | Tenant Transactions Summary |
| `tenant_unpaid_charges_summary` | Tenant Unpaid Charges Summary |
| `tenant_vehicle_info` | Tenant Vehicle Info |
| `trial_balance` | Trial Balance |
| `trial_balance_by_property` | Trial Balance by Property |
| `trust_account_balance` | Trust Account Balance |
| `trust_account_balance_detail` | Trust Account Detail |
| `twelve_month_cash_flow` | Cash Flow - 12 Month |
| `twelve_month_income_statement` | Income Statement - 12 Month |
| `unit_directory` | Unit Directory |
| `unit_inspection` | Unit Inspection |
| `unit_turn_detail` | Unit Turn Detail |
| `unit_vacancy` | Unit Vacancy Detail |
| `unpaid_balances_by_month` | Unpaid Balances by Month |
| `upcoming_activities` | Activities Summary |
| `vendor1099` | Vendor 1099 Summary |
| `vendor_directory` | Vendor Directory |
| `vendor_ledger` | Vendor Ledger |
| `work_order` | Work Order |
| `work_order_labor_summary` | Work Order Labor Summary |
