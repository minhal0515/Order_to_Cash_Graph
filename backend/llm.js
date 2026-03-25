const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function generateSQL(question) {
  const prompt = `
You are a PostgreSQL expert.

Generate one SELECT query for the user question using only the schema below.

Database schema:

Table: customers
- id (text)
- name (text)
- created_at (timestamp)
- is_blocked (boolean)

Table: business_partner_addresses
- business_partner_id (text)
- address_id (text)
- validity_start_date (timestamp)
- validity_end_date (timestamp)
- address_uuid (text)
- address_time_zone (text)
- city_name (text)
- country (text)
- po_box (text)
- po_box_deviating_city_name (text)
- po_box_deviating_country (text)
- po_box_deviating_region (text)
- po_box_is_without_number (boolean)
- po_box_lobby_name (text)
- po_box_postal_code (text)
- postal_code (text)
- region (text)
- street_name (text)
- tax_jurisdiction (text)
- transport_zone (text)

Table: customer_company_assignments
- customer_id (text)
- company_code (text)
- accounting_clerk (text)
- accounting_clerk_fax_number (text)
- accounting_clerk_internet_address (text)
- accounting_clerk_phone_number (text)
- alternative_payer_account (text)
- payment_blocking_reason (text)
- payment_methods_list (text)
- payment_terms (text)
- reconciliation_account (text)
- deletion_indicator (boolean)
- customer_account_group (text)

Table: customer_sales_area_assignments
- customer_id (text)
- sales_organization (text)
- distribution_channel (text)
- division (text)
- billing_is_blocked_for_customer (text)
- complete_delivery_is_defined (boolean)
- credit_control_area (text)
- currency (text)
- customer_payment_terms (text)
- delivery_priority (text)
- incoterms_classification (text)
- incoterms_location1 (text)
- sales_group (text)
- sales_office (text)
- shipping_condition (text)
- sls_unlimited_overdelivery_allowed (boolean)
- supplying_plant (text)
- sales_district (text)
- exchange_rate_type (text)

Table: products
- id (text)
- name (text)
- created_at (timestamp)
- is_deleted (boolean)

Table: product_descriptions
- product_id (text)
- language (text)
- product_description (text)

Table: plants
- id (text)
- name (text)
- valuation_area (text)
- plant_customer (text)
- plant_supplier (text)
- factory_calendar (text)
- default_purchasing_organization (text)
- sales_organization (text)
- address_id (text)
- plant_category (text)
- distribution_channel (text)
- division (text)
- language (text)
- is_marked_for_archiving (boolean)

Table: product_plants
- product_id (text)
- plant_id (text)
- country_of_origin (text)
- region_of_origin (text)
- production_inventory_managed_location (text)
- availability_check_type (text)
- fiscal_year_variant (text)
- profit_center (text)
- mrp_type (text)

Table: product_storage_locations
- product_id (text)
- plant_id (text)
- storage_location (text)
- physical_inventory_block_indicator (text)
- last_posted_count_at (timestamp)

Table: sales_orders
- id (text)
- customer_id (text)
- created_at (timestamp)
- total_amount (numeric)
- currency (text)

Table: sales_order_items
- id (text)
- order_id (text)
- product_id (text)
- quantity (numeric)
- amount (numeric)

Table: sales_order_schedule_lines
- sales_order_id (text)
- sales_order_item (text)
- schedule_line (text)
- confirmed_delivery_date (timestamp)
- order_quantity_unit (text)
- confirmed_order_quantity (numeric)

Table: deliveries
- id (text)
- order_id (text)
- created_at (timestamp)
- status (text)
- shipping_point (text)

Table: invoices
- id (text)
- delivery_id (text)
- customer_id (text)
- created_at (timestamp)
- total_amount (numeric)
- currency (text)
- is_cancelled (boolean)

Table: billing_document_cancellations
- billing_document (text)
- billing_document_type (text)
- creation_date (timestamp)
- creation_time (time)
- last_change_at (timestamp)
- billing_document_date (timestamp)
- billing_document_is_cancelled (boolean)
- cancelled_billing_document (text)
- total_net_amount (numeric)
- transaction_currency (text)
- company_code (text)
- fiscal_year (text)
- accounting_document (text)
- customer_id (text)

Table: journal_entries
- company_code (text)
- fiscal_year (text)
- accounting_document (text)
- accounting_document_item (text)
- gl_account (text)
- reference_document (text)
- cost_center (text)
- profit_center (text)
- transaction_currency (text)
- amount_in_transaction_currency (numeric)
- company_code_currency (text)
- amount_in_company_code_currency (numeric)
- posting_date (timestamp)
- document_date (timestamp)
- accounting_document_type (text)
- assignment_reference (text)
- last_change_at (timestamp)
- customer_id (text)
- financial_account_type (text)
- clearing_date (timestamp)
- clearing_accounting_document (text)
- clearing_doc_fiscal_year (text)

Table: payments
- company_code (text)
- fiscal_year (text)
- accounting_document (text)
- accounting_document_item (text)
- clearing_date (timestamp)
- clearing_accounting_document (text)
- clearing_doc_fiscal_year (text)
- amount_in_transaction_currency (numeric)
- transaction_currency (text)
- amount_in_company_code_currency (numeric)
- company_code_currency (text)
- customer_id (text)
- invoice_id (text)
- invoice_reference_fiscal_year (text)
- sales_document_id (text)
- sales_document_item (text)
- posting_date (timestamp)
- document_date (timestamp)
- assignment_reference (text)
- gl_account (text)
- financial_account_type (text)
- profit_center (text)
- cost_center (text)

Defined relationships:
- sales_orders.customer_id -> customers.id
- sales_order_items.order_id -> sales_orders.id
- sales_order_items.product_id -> products.id
- sales_order_schedule_lines.sales_order_id -> sales_orders.id
- deliveries.order_id -> sales_orders.id
- invoices.delivery_id -> deliveries.id
- invoices.customer_id -> customers.id
- business_partner_addresses.business_partner_id -> customers.id
- customer_company_assignments.customer_id -> customers.id
- customer_sales_area_assignments.customer_id -> customers.id
- product_descriptions.product_id -> products.id
- product_plants.product_id -> products.id
- product_plants.plant_id -> plants.id
- product_storage_locations.product_id -> products.id
- product_storage_locations.plant_id -> plants.id
- payments.invoice_id -> invoices.id when payments.invoice_id is not null
- journal_entries.reference_document -> invoices.id when reference_document matches an invoice id

Rules:
- ONLY use the tables and columns listed above
- DO NOT invent columns
- DO NOT invent relationships
- Prefer simple SQL
- Avoid unnecessary filters
- Use explicit JOIN conditions based only on the defined relationships above
- For missing relationships, use LEFT JOIN and IS NULL
- If the user asks for invoices, prefer returning i.id
- Do not return multiple id columns unless the user explicitly asks for them
- Output pure SQL only
- Do not include markdown
- Do not include explanations

Examples:

User: Find invoices without deliveries
SQL:
SELECT i.id
FROM invoices i
LEFT JOIN deliveries d ON i.delivery_id = d.id
WHERE d.id IS NULL;

User: Show payments linked to invoices
SQL:
SELECT p.accounting_document, p.invoice_id
FROM payments p
JOIN invoices i ON p.invoice_id = i.id;

User: Show plants for a product
SQL:
SELECT pp.product_id, pp.plant_id
FROM product_plants pp
WHERE pp.product_id = '3001456';

User question:
${question}
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}

async function generateAnswer(question, sql, data) {
  const prompt = `
You are a precise data analyst.

User question:
${question}

SQL executed:
${sql}

Number of rows:
${data.length}

Query result (JSON):
${JSON.stringify(data)}

Rules:
- ONLY use the data provided
- DO NOT assume anything
- If results exist, explain what they show
- Always use the provided count
- Be concise
- If empty, clearly say no results found
- Keep the answer short and factual
- If interpretation is uncertain, briefly state the assumption

Now answer:
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}

module.exports = { generateSQL, generateAnswer };
