require("dotenv").config();
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const pool = require("./db");

const DATA_ROOT = path.resolve(__dirname, "..", "sap-o2c-data");

function getDatasetFiles(datasetName) {
  const folderPath = path.join(DATA_ROOT, datasetName);
  return fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => path.join(folderPath, file));
}

function safeParseJson(line, filePath) {
  if (!line || !line.trim()) {
    return null;
  }

  try {
    return JSON.parse(line);
  } catch (err) {
    console.error(`JSON parse error in ${filePath}:`, err.message);
    return null;
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toTimestamp(value) {
  return value || null;
}

function toText(value) {
  return value === undefined ? null : value;
}

function formatTime(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const hours = String(value.hours ?? 0).padStart(2, "0");
  const minutes = String(value.minutes ?? 0).padStart(2, "0");
  const seconds = String(value.seconds ?? 0).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

async function processDataset(datasetName, onRecord) {
  const files = getDatasetFiles(datasetName);

  for (const filePath of files) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const data = safeParseJson(line, filePath);
      if (!data) {
        continue;
      }

      await onRecord(data, filePath);
    }
  }
}

async function seedCustomers() {
  await processDataset("business_partners", async (data) => {
    const id = data.businessPartner;
    const name = data.businessPartnerFullName;
    const createdAt = toTimestamp(data.creationDate);
    const isBlocked = data.businessPartnerIsBlocked ?? null;

    try {
      await pool.query(
        `INSERT INTO customers (id, name, created_at, is_blocked)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, name, createdAt, isBlocked]
      );
    } catch (err) {
      console.error("Insert error:", err);
    }
  });

  console.log("Customers seeded");
}

async function seedSalesOrders() {
  await processDataset("sales_order_headers", async (data) => {
    const id = data.salesOrder;
    const customerId = data.soldToParty;
    const createdAt = toTimestamp(data.creationDate);
    const totalAmount = toNumber(data.totalNetAmount);
    const currency = data.transactionCurrency;

    try {
      await pool.query(
        `INSERT INTO sales_orders (id, customer_id, created_at, total_amount, currency)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, customerId, createdAt, totalAmount, currency]
      );
    } catch (err) {
      console.error("Order insert error:", err);
    }
  });

  console.log("Sales orders seeded");
}

async function seedSalesOrderItems() {
  await processDataset("sales_order_items", async (data) => {
    const id = `${data.salesOrder}_${data.salesOrderItem}`;
    const orderId = data.salesOrder;
    const productId = data.material;
    const quantity = toNumber(data.requestedQuantity);
    const amount = toNumber(data.netAmount);

    try {
      await pool.query(
        `INSERT INTO sales_order_items (id, order_id, product_id, quantity, amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, orderId, productId, quantity, amount]
      );
    } catch (err) {
      console.error("Order item insert error:", err);
    }
  });

  console.log("Sales order items seeded");
}

async function seedProducts() {
  await processDataset("products", async (data) => {
    const id = data.product;
    const name = data.productOldId;
    const createdAt = toTimestamp(data.creationDate);
    const isDeleted = data.isMarkedForDeletion ?? null;

    try {
      await pool.query(
        `INSERT INTO products (id, name, created_at, is_deleted)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, name, createdAt, isDeleted]
      );
    } catch (err) {
      console.error("Product insert error:", err);
    }
  });

  console.log("Products seeded");
}

async function seedDeliveries() {
  const seen = new Set();

  await processDataset("outbound_delivery_items", async (data) => {
    const id = data.deliveryDocument;
    const orderId = data.referenceSdDocument;

    if (seen.has(id)) {
      return;
    }

    seen.add(id);

    try {
      await pool.query(
        `INSERT INTO deliveries (id, order_id)
         VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [id, orderId]
      );
    } catch (err) {
      console.error("Delivery insert error:", err);
    }
  });

  console.log("Deliveries seeded");
}

async function seedDeliveryHeaders() {
  await processDataset("outbound_delivery_headers", async (data) => {
    const id = data.deliveryDocument;
    const createdAt = toTimestamp(data.creationDate);
    const status = data.overallGoodsMovementStatus;
    const shippingPoint = data.shippingPoint;

    try {
      await pool.query(
        `UPDATE deliveries
         SET created_at = $1,
             status = $2,
             shipping_point = $3
         WHERE id = $4`,
        [createdAt, status, shippingPoint, id]
      );
    } catch (err) {
      console.error("Delivery header update error:", err);
    }
  });

  console.log("All delivery headers processed");
}

async function seedInvoicesFromItems() {
  const seen = new Set();

  await processDataset("billing_document_items", async (data) => {
    const id = data.billingDocument;
    const deliveryId = data.referenceSdDocument;

    if (seen.has(id)) {
      return;
    }

    seen.add(id);

    try {
      await pool.query(
        `INSERT INTO invoices (id, delivery_id)
         VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [id, deliveryId]
      );
    } catch (err) {
      console.error("Invoice insert error:", err);
    }
  });

  console.log("Invoices (items) seeded");
}

async function seedInvoiceHeaders() {
  await processDataset("billing_document_headers", async (data) => {
    const id = data.billingDocument;
    const customerId = data.soldToParty;
    const createdAt = toTimestamp(data.creationDate);
    const totalAmount = toNumber(data.totalNetAmount);
    const currency = data.transactionCurrency;
    const isCancelled = data.billingDocumentIsCancelled ?? null;

    try {
      await pool.query(
        `UPDATE invoices
         SET customer_id = $1,
             created_at = $2,
             total_amount = $3,
             currency = $4,
             is_cancelled = $5
         WHERE id = $6`,
        [customerId, createdAt, totalAmount, currency, isCancelled, id]
      );
    } catch (err) {
      console.error("Invoice update error:", err);
    }
  });

  console.log("Invoice headers updated");
}

async function seedBillingDocumentCancellations() {
  await processDataset("billing_document_cancellations", async (data) => {
    try {
      await pool.query(
        `INSERT INTO billing_document_cancellations (
           billing_document,
           billing_document_type,
           creation_date,
           creation_time,
           last_change_at,
           billing_document_date,
           billing_document_is_cancelled,
           cancelled_billing_document,
           total_net_amount,
           transaction_currency,
           company_code,
           fiscal_year,
           accounting_document,
           customer_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14
         )
         ON CONFLICT (billing_document) DO NOTHING`,
        [
          data.billingDocument,
          toText(data.billingDocumentType),
          toTimestamp(data.creationDate),
          formatTime(data.creationTime),
          toTimestamp(data.lastChangeDateTime),
          toTimestamp(data.billingDocumentDate),
          data.billingDocumentIsCancelled ?? null,
          toText(data.cancelledBillingDocument),
          toNumber(data.totalNetAmount),
          toText(data.transactionCurrency),
          toText(data.companyCode),
          toText(data.fiscalYear),
          toText(data.accountingDocument),
          toText(data.soldToParty),
        ]
      );
    } catch (err) {
      console.error("Billing cancellation insert error:", err);
    }
  });

  console.log("Billing document cancellations seeded");
}

async function seedBusinessPartnerAddresses() {
  await processDataset("business_partner_addresses", async (data) => {
    try {
      await pool.query(
        `INSERT INTO business_partner_addresses (
           business_partner_id,
           address_id,
           validity_start_date,
           validity_end_date,
           address_uuid,
           address_time_zone,
           city_name,
           country,
           po_box,
           po_box_deviating_city_name,
           po_box_deviating_country,
           po_box_deviating_region,
           po_box_is_without_number,
           po_box_lobby_name,
           po_box_postal_code,
           postal_code,
           region,
           street_name,
           tax_jurisdiction,
           transport_zone
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
         )
         ON CONFLICT (business_partner_id, address_id) DO NOTHING`,
        [
          data.businessPartner,
          data.addressId,
          toTimestamp(data.validityStartDate),
          toTimestamp(data.validityEndDate),
          toText(data.addressUuid),
          toText(data.addressTimeZone),
          toText(data.cityName),
          toText(data.country),
          toText(data.poBox),
          toText(data.poBoxDeviatingCityName),
          toText(data.poBoxDeviatingCountry),
          toText(data.poBoxDeviatingRegion),
          data.poBoxIsWithoutNumber ?? null,
          toText(data.poBoxLobbyName),
          toText(data.poBoxPostalCode),
          toText(data.postalCode),
          toText(data.region),
          toText(data.streetName),
          toText(data.taxJurisdiction),
          toText(data.transportZone),
        ]
      );
    } catch (err) {
      console.error("Business partner address insert error:", err);
    }
  });

  console.log("Business partner addresses seeded");
}

async function seedCustomerCompanyAssignments() {
  await processDataset("customer_company_assignments", async (data) => {
    try {
      await pool.query(
        `INSERT INTO customer_company_assignments (
           customer_id,
           company_code,
           accounting_clerk,
           accounting_clerk_fax_number,
           accounting_clerk_internet_address,
           accounting_clerk_phone_number,
           alternative_payer_account,
           payment_blocking_reason,
           payment_methods_list,
           payment_terms,
           reconciliation_account,
           deletion_indicator,
           customer_account_group
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13
         )
         ON CONFLICT (customer_id, company_code) DO NOTHING`,
        [
          data.customer,
          data.companyCode,
          toText(data.accountingClerk),
          toText(data.accountingClerkFaxNumber),
          toText(data.accountingClerkInternetAddress),
          toText(data.accountingClerkPhoneNumber),
          toText(data.alternativePayerAccount),
          toText(data.paymentBlockingReason),
          toText(data.paymentMethodsList),
          toText(data.paymentTerms),
          toText(data.reconciliationAccount),
          data.deletionIndicator ?? null,
          toText(data.customerAccountGroup),
        ]
      );
    } catch (err) {
      console.error("Customer company assignment insert error:", err);
    }
  });

  console.log("Customer company assignments seeded");
}

async function seedCustomerSalesAreaAssignments() {
  await processDataset("customer_sales_area_assignments", async (data) => {
    try {
      await pool.query(
        `INSERT INTO customer_sales_area_assignments (
           customer_id,
           sales_organization,
           distribution_channel,
           division,
           billing_is_blocked_for_customer,
           complete_delivery_is_defined,
           credit_control_area,
           currency,
           customer_payment_terms,
           delivery_priority,
           incoterms_classification,
           incoterms_location1,
           sales_group,
           sales_office,
           shipping_condition,
           sls_unlimited_overdelivery_allowed,
           supplying_plant,
           sales_district,
           exchange_rate_type
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19
         )
         ON CONFLICT (customer_id, sales_organization, distribution_channel, division) DO NOTHING`,
        [
          data.customer,
          data.salesOrganization,
          data.distributionChannel,
          data.division,
          toText(data.billingIsBlockedForCustomer),
          data.completeDeliveryIsDefined ?? null,
          toText(data.creditControlArea),
          toText(data.currency),
          toText(data.customerPaymentTerms),
          toText(data.deliveryPriority),
          toText(data.incotermsClassification),
          toText(data.incotermsLocation1),
          toText(data.salesGroup),
          toText(data.salesOffice),
          toText(data.shippingCondition),
          data.slsUnlmtdOvrdelivIsAllwd ?? null,
          toText(data.supplyingPlant),
          toText(data.salesDistrict),
          toText(data.exchangeRateType),
        ]
      );
    } catch (err) {
      console.error("Customer sales area assignment insert error:", err);
    }
  });

  console.log("Customer sales area assignments seeded");
}

async function seedJournalEntries() {
  await processDataset("journal_entry_items_accounts_receivable", async (data) => {
    try {
      await pool.query(
        `INSERT INTO journal_entries (
          company_code,
          fiscal_year,
          accounting_document,
          accounting_document_item,
          gl_account,
          reference_document,
          cost_center,
          profit_center,
          transaction_currency,
          amount_in_transaction_currency,
          company_code_currency,
          amount_in_company_code_currency,
          posting_date,
          document_date,
          accounting_document_type,
          assignment_reference,
          last_change_at,
          customer_id,
          financial_account_type,
          clearing_date,
          clearing_accounting_document,
          clearing_doc_fiscal_year
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        )`,
        [
          data.companyCode,
          data.fiscalYear,
          data.accountingDocument,
          data.accountingDocumentItem,
          data.glAccount,
          data.referenceDocument, // ✅ THIS IS THE KEY FIX
          data.costCenter || null,
          data.profitCenter,
          data.transactionCurrency,
          data.amountInTransactionCurrency,
          data.companyCodeCurrency,
          data.amountInCompanyCodeCurrency,
          data.postingDate,
          data.documentDate,
          data.accountingDocumentType,
          data.assignmentReference || null,
          data.lastChangeDateTime,
          data.customer,
          data.financialAccountType,
          data.clearingDate,
          data.clearingAccountingDocument,
          data.clearingDocFiscalYear
        ]
      );
    } catch (err) {
      console.error("Journal entry insert error:", err);
    }
  });

  console.log("Journal entries seeded");
}

async function seedPayments() {
  await processDataset("payments_accounts_receivable", async (data) => {
    try {
      await pool.query(
  `INSERT INTO journal_entries (
    company_code,
    fiscal_year,
    accounting_document,
    accounting_document_item,
    gl_account,
    reference_document,
    cost_center,
    profit_center,
    transaction_currency,
    amount_in_transaction_currency,
    company_code_currency,
    amount_in_company_code_currency,
    posting_date,
    document_date,
    accounting_document_type,
    assignment_reference,
    last_change_at,
    customer_id,
    financial_account_type,
    clearing_date,
    clearing_accounting_document,
    clearing_doc_fiscal_year
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
  )`,
  [
    data.companyCode,
    data.fiscalYear,
    data.accountingDocument,
    data.accountingDocumentItem,
    data.glAccount,
    data.referenceDocument, // ✅ THIS IS THE KEY FIX
    data.costCenter || null,
    data.profitCenter,
    data.transactionCurrency,
    data.amountInTransactionCurrency,
    data.companyCodeCurrency,
    data.amountInCompanyCodeCurrency,
    data.postingDate,
    data.documentDate,
    data.accountingDocumentType,
    data.assignmentReference || null,
    data.lastChangeDateTime,
    data.customer,
    data.financialAccountType,
    data.clearingDate,
    data.clearingAccountingDocument,
    data.clearingDocFiscalYear
  ]
);
    } catch (err) {
      console.error("Payment insert error:", err);
    }
  });
  console.log("Payments seeded");
}

async function seedPlants() {
  await processDataset("plants", async (data) => {
    try {
      await pool.query(
        `INSERT INTO plants (
           id,
           name,
           valuation_area,
           plant_customer,
           plant_supplier,
           factory_calendar,
           default_purchasing_organization,
           sales_organization,
           address_id,
           plant_category,
           distribution_channel,
           division,
           language,
           is_marked_for_archiving
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          data.plant,
          toText(data.plantName),
          toText(data.valuationArea),
          toText(data.plantCustomer),
          toText(data.plantSupplier),
          toText(data.factoryCalendar),
          toText(data.defaultPurchasingOrganization),
          toText(data.salesOrganization),
          toText(data.addressId),
          toText(data.plantCategory),
          toText(data.distributionChannel),
          toText(data.division),
          toText(data.language),
          data.isMarkedForArchiving ?? null,
        ]
      );
    } catch (err) {
      console.error("Plant insert error:", err);
    }
  });

  console.log("Plants seeded");
}

async function seedProductDescriptions() {
  await processDataset("product_descriptions", async (data) => {
    try {
      await pool.query(
        `INSERT INTO product_descriptions (product_id, language, product_description)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, language) DO NOTHING`,
        [data.product, data.language, toText(data.productDescription)]
      );
    } catch (err) {
      console.error("Product description insert error:", err);
    }
  });

  console.log("Product descriptions seeded");
}

async function seedProductPlants() {
  await processDataset("product_plants", async (data) => {
    try {
      await pool.query(
        `INSERT INTO product_plants (
           product_id,
           plant_id,
           country_of_origin,
           region_of_origin,
           production_inventory_managed_location,
           availability_check_type,
           fiscal_year_variant,
           profit_center,
           mrp_type
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_id, plant_id) DO NOTHING`,
        [
          data.product,
          data.plant,
          toText(data.countryOfOrigin),
          toText(data.regionOfOrigin),
          toText(data.productionInvtryManagedLoc),
          toText(data.availabilityCheckType),
          toText(data.fiscalYearVariant),
          toText(data.profitCenter),
          toText(data.mrpType),
        ]
      );
    } catch (err) {
      console.error("Product plant insert error:", err);
    }
  });

  console.log("Product plants seeded");
}

async function seedProductStorageLocations() {
  await processDataset("product_storage_locations", async (data) => {
    try {
      await pool.query(
        `INSERT INTO product_storage_locations (
           product_id,
           plant_id,
           storage_location,
           physical_inventory_block_indicator,
           last_posted_count_at
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, plant_id, storage_location) DO NOTHING`,
        [
          data.product,
          data.plant,
          data.storageLocation,
          toText(data.physicalInventoryBlockInd),
          toTimestamp(data.dateOfLastPostedCntUnRstrcdStk),
        ]
      );
    } catch (err) {
      console.error("Product storage location insert error:", err);
    }
  });

  console.log("Product storage locations seeded");
}

async function seedSalesOrderScheduleLines() {
  await processDataset("sales_order_schedule_lines", async (data) => {
    try {
      await pool.query(
        `INSERT INTO sales_order_schedule_lines (
           sales_order_id,
           sales_order_item,
           schedule_line,
           confirmed_delivery_date,
           order_quantity_unit,
           confirmed_order_quantity
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sales_order_id, sales_order_item, schedule_line) DO NOTHING`,
        [
          data.salesOrder,
          data.salesOrderItem,
          data.scheduleLine,
          toTimestamp(data.confirmedDeliveryDate),
          toText(data.orderQuantityUnit),
          toNumber(data.confdOrderQtyByMatlAvailCheck),
        ]
      );
    } catch (err) {
      console.error("Sales order schedule line insert error:", err);
    }
  });

  console.log("Sales order schedule lines seeded");
}

async function run() {
  await seedCustomers();
  await seedProducts();
  await seedPlants();
  await seedSalesOrders();
  await seedSalesOrderItems();
  await seedSalesOrderScheduleLines();
  await seedDeliveries();
  await seedDeliveryHeaders();
  await seedInvoicesFromItems();
  await seedInvoiceHeaders();
  await seedBillingDocumentCancellations();
  await seedBusinessPartnerAddresses();
  await seedCustomerCompanyAssignments();
  await seedCustomerSalesAreaAssignments();
  await seedProductDescriptions();
  await seedProductPlants();
  await seedProductStorageLocations();
  await seedJournalEntries();
  await seedPayments();
}

run();
