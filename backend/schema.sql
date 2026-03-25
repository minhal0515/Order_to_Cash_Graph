CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP,
  is_blocked BOOLEAN
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP,
  is_deleted BOOLEAN
);

CREATE TABLE IF NOT EXISTS plants (
  id TEXT PRIMARY KEY,
  name TEXT,
  valuation_area TEXT,
  plant_customer TEXT,
  plant_supplier TEXT,
  factory_calendar TEXT,
  default_purchasing_organization TEXT,
  sales_organization TEXT,
  address_id TEXT,
  plant_category TEXT,
  distribution_channel TEXT,
  division TEXT,
  language TEXT,
  is_marked_for_archiving BOOLEAN
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  created_at TIMESTAMP,
  total_amount NUMERIC,
  currency TEXT
);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_id TEXT,
  quantity NUMERIC,
  amount NUMERIC
);

CREATE TABLE IF NOT EXISTS sales_order_schedule_lines (
  sales_order_id TEXT NOT NULL,
  sales_order_item TEXT NOT NULL,
  schedule_line TEXT NOT NULL,
  confirmed_delivery_date TIMESTAMP,
  order_quantity_unit TEXT,
  confirmed_order_quantity NUMERIC,
  PRIMARY KEY (sales_order_id, sales_order_item, schedule_line)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  created_at TIMESTAMP,
  status TEXT,
  shipping_point TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  delivery_id TEXT,
  customer_id TEXT,
  created_at TIMESTAMP,
  total_amount NUMERIC,
  currency TEXT,
  is_cancelled BOOLEAN
);

CREATE TABLE IF NOT EXISTS billing_document_cancellations (
  billing_document TEXT PRIMARY KEY,
  billing_document_type TEXT,
  creation_date TIMESTAMP,
  creation_time TIME,
  last_change_at TIMESTAMP,
  billing_document_date TIMESTAMP,
  billing_document_is_cancelled BOOLEAN,
  cancelled_billing_document TEXT,
  total_net_amount NUMERIC,
  transaction_currency TEXT,
  company_code TEXT,
  fiscal_year TEXT,
  accounting_document TEXT,
  customer_id TEXT
);

CREATE TABLE IF NOT EXISTS business_partner_addresses (
  business_partner_id TEXT NOT NULL,
  address_id TEXT NOT NULL,
  validity_start_date TIMESTAMP,
  validity_end_date TIMESTAMP,
  address_uuid TEXT,
  address_time_zone TEXT,
  city_name TEXT,
  country TEXT,
  po_box TEXT,
  po_box_deviating_city_name TEXT,
  po_box_deviating_country TEXT,
  po_box_deviating_region TEXT,
  po_box_is_without_number BOOLEAN,
  po_box_lobby_name TEXT,
  po_box_postal_code TEXT,
  postal_code TEXT,
  region TEXT,
  street_name TEXT,
  tax_jurisdiction TEXT,
  transport_zone TEXT,
  PRIMARY KEY (business_partner_id, address_id)
);

CREATE TABLE IF NOT EXISTS customer_company_assignments (
  customer_id TEXT NOT NULL,
  company_code TEXT NOT NULL,
  accounting_clerk TEXT,
  accounting_clerk_fax_number TEXT,
  accounting_clerk_internet_address TEXT,
  accounting_clerk_phone_number TEXT,
  alternative_payer_account TEXT,
  payment_blocking_reason TEXT,
  payment_methods_list TEXT,
  payment_terms TEXT,
  reconciliation_account TEXT,
  deletion_indicator BOOLEAN,
  customer_account_group TEXT,
  PRIMARY KEY (customer_id, company_code)
);

CREATE TABLE IF NOT EXISTS customer_sales_area_assignments (
  customer_id TEXT NOT NULL,
  sales_organization TEXT NOT NULL,
  distribution_channel TEXT NOT NULL,
  division TEXT NOT NULL,
  billing_is_blocked_for_customer TEXT,
  complete_delivery_is_defined BOOLEAN,
  credit_control_area TEXT,
  currency TEXT,
  customer_payment_terms TEXT,
  delivery_priority TEXT,
  incoterms_classification TEXT,
  incoterms_location1 TEXT,
  sales_group TEXT,
  sales_office TEXT,
  shipping_condition TEXT,
  sls_unlimited_overdelivery_allowed BOOLEAN,
  supplying_plant TEXT,
  sales_district TEXT,
  exchange_rate_type TEXT,
  PRIMARY KEY (customer_id, sales_organization, distribution_channel, division)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  company_code TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  accounting_document TEXT NOT NULL,
  accounting_document_item TEXT NOT NULL,
  gl_account TEXT,
  reference_document TEXT,
  cost_center TEXT,
  profit_center TEXT,
  transaction_currency TEXT,
  amount_in_transaction_currency NUMERIC,
  company_code_currency TEXT,
  amount_in_company_code_currency NUMERIC,
  posting_date TIMESTAMP,
  document_date TIMESTAMP,
  accounting_document_type TEXT,
  assignment_reference TEXT,
  last_change_at TIMESTAMP,
  customer_id TEXT,
  financial_account_type TEXT,
  clearing_date TIMESTAMP,
  clearing_accounting_document TEXT,
  clearing_doc_fiscal_year TEXT,
  PRIMARY KEY (company_code, fiscal_year, accounting_document, accounting_document_item)
);

CREATE TABLE IF NOT EXISTS payments (
  company_code TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  accounting_document TEXT NOT NULL,
  accounting_document_item TEXT NOT NULL,
  clearing_date TIMESTAMP,
  clearing_accounting_document TEXT,
  clearing_doc_fiscal_year TEXT,
  amount_in_transaction_currency NUMERIC,
  transaction_currency TEXT,
  amount_in_company_code_currency NUMERIC,
  company_code_currency TEXT,
  customer_id TEXT,
  invoice_id TEXT,
  invoice_reference_fiscal_year TEXT,
  sales_document_id TEXT,
  sales_document_item TEXT,
  posting_date TIMESTAMP,
  document_date TIMESTAMP,
  assignment_reference TEXT,
  gl_account TEXT,
  financial_account_type TEXT,
  profit_center TEXT,
  cost_center TEXT,
  PRIMARY KEY (company_code, fiscal_year, accounting_document, accounting_document_item)
);

CREATE TABLE IF NOT EXISTS product_descriptions (
  product_id TEXT NOT NULL,
  language TEXT NOT NULL,
  product_description TEXT,
  PRIMARY KEY (product_id, language)
);

CREATE TABLE IF NOT EXISTS product_plants (
  product_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  country_of_origin TEXT,
  region_of_origin TEXT,
  production_inventory_managed_location TEXT,
  availability_check_type TEXT,
  fiscal_year_variant TEXT,
  profit_center TEXT,
  mrp_type TEXT,
  PRIMARY KEY (product_id, plant_id)
);

CREATE TABLE IF NOT EXISTS product_storage_locations (
  product_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  storage_location TEXT NOT NULL,
  physical_inventory_block_indicator TEXT,
  last_posted_count_at TIMESTAMP,
  PRIMARY KEY (product_id, plant_id, storage_location)
);

-- Application relationships derived from dataset field names:
-- sales_orders.customer_id -> customers.id
-- sales_order_items.order_id -> sales_orders.id
-- sales_order_items.product_id -> products.id
-- sales_order_schedule_lines.sales_order_id -> sales_orders.id
-- deliveries.order_id -> sales_orders.id
-- invoices.delivery_id -> deliveries.id
-- invoices.customer_id -> customers.id
-- business_partner_addresses.business_partner_id -> customers.id
-- customer_company_assignments.customer_id -> customers.id
-- customer_sales_area_assignments.customer_id -> customers.id
-- product_descriptions.product_id -> products.id
-- product_plants.product_id -> products.id
-- product_plants.plant_id -> plants.id
-- product_storage_locations.product_id -> products.id
-- product_storage_locations.plant_id -> plants.id
-- payments.invoice_id -> invoices.id when populated
-- journal_entries.reference_document -> invoices.id when matching invoice ids
