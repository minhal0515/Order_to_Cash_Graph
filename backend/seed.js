require("dotenv").config();
const fs = require("fs");
const readline = require("readline");
const path = require("path");
const pool = require("./db");

const DATA_ROOT = path.resolve(__dirname, "..", "sap-o2c-data");
const BATCH_SIZE = Math.max(
  1,
  parseInt(process.env.SEED_BATCH_SIZE || "100", 10) || 100
);
const LOG_BATCHES = process.env.SEED_LOG_BATCHES !== "false";

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

  const normalized =
    typeof value === "string" ? value.replace(/,/g, "").trim() : value;

  if (normalized === "") {
    return null;
  }

  const parsed = parseFloat(normalized);
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
  return value ? value : null;
}

function toText(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
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

function buildPlaceholders(rowCount, columnCount) {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const offset = rowIndex * columnCount;
    const rowPlaceholders = Array.from(
      { length: columnCount },
      (_, columnIndex) => `$${offset + columnIndex + 1}`
    );

    return `(${rowPlaceholders.join(", ")})`;
  }).join(", ");
}

function flattenRows(rows) {
  return rows.flat();
}

async function yieldToEventLoop() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function processDataset(datasetName, onBatch, batchSize = BATCH_SIZE) {
  const files = getDatasetFiles(datasetName);
  let batch = [];

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

      batch.push(data);

      if (batch.length >= batchSize) {
        await onBatch(batch);
        batch = [];
        await yieldToEventLoop();
      }
    }
  }

  if (batch.length > 0) {
    await onBatch(batch);
    await yieldToEventLoop();
  }
}

async function insertBatch({
  table,
  columns,
  rows,
  conflictTarget,
  logLabel = table,
}) {
  if (!rows.length) {
    return 0;
  }

  const sql = `
    INSERT INTO ${table} (${columns.join(", ")})
    VALUES ${buildPlaceholders(rows.length, columns.length)}
    ON CONFLICT ${conflictTarget} DO NOTHING
  `;

  const result = await pool.query(sql, flattenRows(rows));

  if (LOG_BATCHES) {
    console.log(
      `[${logLabel}] inserted batch ${result.rowCount}/${rows.length}`
    );
  }

  return result.rowCount;
}

async function updateBatch({
  table,
  keyColumns,
  updateColumns,
  rows,
  logLabel = table,
}) {
  if (!rows.length) {
    return 0;
  }

  const allColumns = [...keyColumns, ...updateColumns];
  const assignments = updateColumns
    .map((column) => `${column} = source.${column}`)
    .join(", ");
  const matches = keyColumns
    .map((column) => `target.${column} = source.${column}`)
    .join(" AND ");

  const sql = `
    UPDATE ${table} AS target
    SET ${assignments}
    FROM (
      VALUES ${buildPlaceholders(rows.length, allColumns.length)}
    ) AS source (${allColumns.join(", ")})
    WHERE ${matches}
  `;

  const result = await pool.query(sql, flattenRows(rows));

  if (LOG_BATCHES) {
    console.log(
      `[${logLabel}] updated batch ${result.rowCount}/${rows.length}`
    );
  }

  return result.rowCount;
}

async function seedInsertDataset({
  datasetName,
  table,
  columns,
  conflictTarget,
  mapRow,
  logLabel,
  dedupeKey,
}) {
  let insertedCount = 0;
  const seen = dedupeKey ? new Set() : null;

  await processDataset(datasetName, async (batch) => {
    const rows = [];

    for (const data of batch) {
      if (seen) {
        const key = dedupeKey(data);

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
      }

      rows.push(mapRow(data));
    }

    if (!rows.length) {
      return;
    }

    try {
      insertedCount += await insertBatch({
        table,
        columns,
        rows,
        conflictTarget,
        logLabel,
      });
    } catch (err) {
      console.error(`[${logLabel}] batch insert error:`, err);
      throw err;
    }
  });

  console.log(`[${logLabel}] inserted total ${insertedCount} rows`);
}

async function seedUpdateDataset({
  datasetName,
  table,
  keyColumns,
  updateColumns,
  mapRow,
  logLabel,
}) {
  let updatedCount = 0;

  await processDataset(datasetName, async (batch) => {
    const rows = batch.map(mapRow);

    try {
      updatedCount += await updateBatch({
        table,
        keyColumns,
        updateColumns,
        rows,
        logLabel,
      });
    } catch (err) {
      console.error(`[${logLabel}] batch update error:`, err);
      throw err;
    }
  });

  console.log(`[${logLabel}] updated total ${updatedCount} rows`);
}

async function seedCustomers() {
  await seedInsertDataset({
    datasetName: "business_partners",
    table: "customers",
    columns: ["id", "name", "created_at", "is_blocked"],
    conflictTarget: "(id)",
    logLabel: "customers",
    mapRow: (data) => [
      data.businessPartner,
      toText(data.businessPartnerFullName),
      toTimestamp(data.creationDate),
      data.businessPartnerIsBlocked ?? null,
    ],
  });
}

async function seedSalesOrders() {
  await seedInsertDataset({
    datasetName: "sales_order_headers",
    table: "sales_orders",
    columns: ["id", "customer_id", "created_at", "total_amount", "currency"],
    conflictTarget: "(id)",
    logLabel: "sales_orders",
    mapRow: (data) => [
      data.salesOrder,
      toText(data.soldToParty),
      toTimestamp(data.creationDate),
      toNumber(data.totalNetAmount),
      toText(data.transactionCurrency),
    ],
  });
}

async function seedSalesOrderItems() {
  await seedInsertDataset({
    datasetName: "sales_order_items",
    table: "sales_order_items",
    columns: ["id", "order_id", "product_id", "quantity", "amount"],
    conflictTarget: "(id)",
    logLabel: "sales_order_items",
    mapRow: (data) => [
      `${data.salesOrder}_${data.salesOrderItem}`,
      data.salesOrder,
      toText(data.material),
      toNumber(data.requestedQuantity),
      toNumber(data.netAmount),
    ],
  });
}

async function seedProducts() {
  await seedInsertDataset({
    datasetName: "products",
    table: "products",
    columns: ["id", "name", "created_at", "is_deleted"],
    conflictTarget: "(id)",
    logLabel: "products",
    mapRow: (data) => [
      data.product,
      toText(data.productOldId),
      toTimestamp(data.creationDate),
      data.isMarkedForDeletion ?? null,
    ],
  });
}

async function seedDeliveries() {
  await seedInsertDataset({
    datasetName: "outbound_delivery_items",
    table: "deliveries",
    columns: ["id", "order_id"],
    conflictTarget: "(id)",
    logLabel: "deliveries",
    dedupeKey: (data) => data.deliveryDocument,
    mapRow: (data) => [data.deliveryDocument, toText(data.referenceSdDocument)],
  });
}

async function seedDeliveryHeaders() {
  await seedUpdateDataset({
    datasetName: "outbound_delivery_headers",
    table: "deliveries",
    keyColumns: ["id"],
    updateColumns: ["created_at", "status", "shipping_point"],
    logLabel: "deliveries",
    mapRow: (data) => [
      data.deliveryDocument,
      toTimestamp(data.creationDate),
      toText(data.overallGoodsMovementStatus),
      toText(data.shippingPoint),
    ],
  });
}

async function seedInvoicesFromItems() {
  await seedInsertDataset({
    datasetName: "billing_document_items",
    table: "invoices",
    columns: ["id", "delivery_id"],
    conflictTarget: "(id)",
    logLabel: "invoices",
    dedupeKey: (data) => data.billingDocument,
    mapRow: (data) => [data.billingDocument, toText(data.referenceSdDocument)],
  });
}

async function seedInvoiceHeaders() {
  await seedUpdateDataset({
    datasetName: "billing_document_headers",
    table: "invoices",
    keyColumns: ["id"],
    updateColumns: [
      "customer_id",
      "created_at",
      "total_amount",
      "currency",
      "is_cancelled",
    ],
    logLabel: "invoices",
    mapRow: (data) => [
      data.billingDocument,
      toText(data.soldToParty),
      toTimestamp(data.creationDate),
      toNumber(data.totalNetAmount),
      toText(data.transactionCurrency),
      data.billingDocumentIsCancelled ?? null,
    ],
  });
}

async function seedBillingDocumentCancellations() {
  await seedInsertDataset({
    datasetName: "billing_document_cancellations",
    table: "billing_document_cancellations",
    columns: [
      "billing_document",
      "billing_document_type",
      "creation_date",
      "creation_time",
      "last_change_at",
      "billing_document_date",
      "billing_document_is_cancelled",
      "cancelled_billing_document",
      "total_net_amount",
      "transaction_currency",
      "company_code",
      "fiscal_year",
      "accounting_document",
      "customer_id",
    ],
    conflictTarget: "(billing_document)",
    logLabel: "billing_document_cancellations",
    mapRow: (data) => [
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
    ],
  });
}

async function seedBusinessPartnerAddresses() {
  await seedInsertDataset({
    datasetName: "business_partner_addresses",
    table: "business_partner_addresses",
    columns: [
      "business_partner_id",
      "address_id",
      "validity_start_date",
      "validity_end_date",
      "address_uuid",
      "address_time_zone",
      "city_name",
      "country",
      "po_box",
      "po_box_deviating_city_name",
      "po_box_deviating_country",
      "po_box_deviating_region",
      "po_box_is_without_number",
      "po_box_lobby_name",
      "po_box_postal_code",
      "postal_code",
      "region",
      "street_name",
      "tax_jurisdiction",
      "transport_zone",
    ],
    conflictTarget: "(business_partner_id, address_id)",
    logLabel: "business_partner_addresses",
    mapRow: (data) => [
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
    ],
  });
}

async function seedCustomerCompanyAssignments() {
  await seedInsertDataset({
    datasetName: "customer_company_assignments",
    table: "customer_company_assignments",
    columns: [
      "customer_id",
      "company_code",
      "accounting_clerk",
      "accounting_clerk_fax_number",
      "accounting_clerk_internet_address",
      "accounting_clerk_phone_number",
      "alternative_payer_account",
      "payment_blocking_reason",
      "payment_methods_list",
      "payment_terms",
      "reconciliation_account",
      "deletion_indicator",
      "customer_account_group",
    ],
    conflictTarget: "(customer_id, company_code)",
    logLabel: "customer_company_assignments",
    mapRow: (data) => [
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
    ],
  });
}

async function seedCustomerSalesAreaAssignments() {
  await seedInsertDataset({
    datasetName: "customer_sales_area_assignments",
    table: "customer_sales_area_assignments",
    columns: [
      "customer_id",
      "sales_organization",
      "distribution_channel",
      "division",
      "billing_is_blocked_for_customer",
      "complete_delivery_is_defined",
      "credit_control_area",
      "currency",
      "customer_payment_terms",
      "delivery_priority",
      "incoterms_classification",
      "incoterms_location1",
      "sales_group",
      "sales_office",
      "shipping_condition",
      "sls_unlimited_overdelivery_allowed",
      "supplying_plant",
      "sales_district",
      "exchange_rate_type",
    ],
    conflictTarget:
      "(customer_id, sales_organization, distribution_channel, division)",
    logLabel: "customer_sales_area_assignments",
    mapRow: (data) => [
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
    ],
  });
}

async function seedJournalEntries() {
  await seedInsertDataset({
    datasetName: "journal_entry_items_accounts_receivable",
    table: "journal_entries",
    columns: [
      "company_code",
      "fiscal_year",
      "accounting_document",
      "accounting_document_item",
      "gl_account",
      "reference_document",
      "cost_center",
      "profit_center",
      "transaction_currency",
      "amount_in_transaction_currency",
      "company_code_currency",
      "amount_in_company_code_currency",
      "posting_date",
      "document_date",
      "accounting_document_type",
      "assignment_reference",
      "last_change_at",
      "customer_id",
      "financial_account_type",
      "clearing_date",
      "clearing_accounting_document",
      "clearing_doc_fiscal_year",
    ],
    conflictTarget:
      "(company_code, fiscal_year, accounting_document, accounting_document_item)",
    logLabel: "journal_entries",
    mapRow: (data) => [
      data.companyCode,
      data.fiscalYear,
      data.accountingDocument,
      data.accountingDocumentItem,
      toText(data.glAccount),
      toText(data.referenceDocument),
      toText(data.costCenter),
      toText(data.profitCenter),
      toText(data.transactionCurrency),
      toNumber(data.amountInTransactionCurrency),
      toText(data.companyCodeCurrency),
      toNumber(data.amountInCompanyCodeCurrency),
      toTimestamp(data.postingDate),
      toTimestamp(data.documentDate),
      toText(data.accountingDocumentType),
      toText(data.assignmentReference),
      toTimestamp(data.lastChangeDateTime),
      toText(data.customer),
      toText(data.financialAccountType),
      toTimestamp(data.clearingDate),
      toText(data.clearingAccountingDocument),
      toText(data.clearingDocFiscalYear),
    ],
  });
}

async function seedPayments() {
  await seedInsertDataset({
    datasetName: "payments_accounts_receivable",
    table: "payments",
    columns: [
      "company_code",
      "fiscal_year",
      "accounting_document",
      "accounting_document_item",
      "clearing_date",
      "clearing_accounting_document",
      "clearing_doc_fiscal_year",
      "amount_in_transaction_currency",
      "transaction_currency",
      "amount_in_company_code_currency",
      "company_code_currency",
      "customer_id",
      "invoice_id",
      "invoice_reference_fiscal_year",
      "sales_document_id",
      "sales_document_item",
      "posting_date",
      "document_date",
      "assignment_reference",
      "gl_account",
      "financial_account_type",
      "profit_center",
      "cost_center",
    ],
    conflictTarget:
      "(company_code, fiscal_year, accounting_document, accounting_document_item)",
    logLabel: "payments",
    mapRow: (data) => [
      data.companyCode,
      data.fiscalYear,
      data.accountingDocument,
      data.accountingDocumentItem,
      toTimestamp(data.clearingDate),
      toText(data.clearingAccountingDocument),
      toText(data.clearingDocFiscalYear),
      toNumber(data.amountInTransactionCurrency),
      toText(data.transactionCurrency),
      toNumber(data.amountInCompanyCodeCurrency),
      toText(data.companyCodeCurrency),
      toText(data.customer),
      toText(data.invoiceReference),
      toText(data.invoiceReferenceFiscalYear),
      toText(data.salesDocument),
      toText(data.salesDocumentItem),
      toTimestamp(data.postingDate),
      toTimestamp(data.documentDate),
      toText(data.assignmentReference),
      toText(data.glAccount),
      toText(data.financialAccountType),
      toText(data.profitCenter),
      toText(data.costCenter),
    ],
  });
}

async function seedPlants() {
  await seedInsertDataset({
    datasetName: "plants",
    table: "plants",
    columns: [
      "id",
      "name",
      "valuation_area",
      "plant_customer",
      "plant_supplier",
      "factory_calendar",
      "default_purchasing_organization",
      "sales_organization",
      "address_id",
      "plant_category",
      "distribution_channel",
      "division",
      "language",
      "is_marked_for_archiving",
    ],
    conflictTarget: "(id)",
    logLabel: "plants",
    mapRow: (data) => [
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
    ],
  });
}

async function seedProductDescriptions() {
  await seedInsertDataset({
    datasetName: "product_descriptions",
    table: "product_descriptions",
    columns: ["product_id", "language", "product_description"],
    conflictTarget: "(product_id, language)",
    logLabel: "product_descriptions",
    mapRow: (data) => [
      data.product,
      data.language,
      toText(data.productDescription),
    ],
  });
}

async function seedProductPlants() {
  await seedInsertDataset({
    datasetName: "product_plants",
    table: "product_plants",
    columns: [
      "product_id",
      "plant_id",
      "country_of_origin",
      "region_of_origin",
      "production_inventory_managed_location",
      "availability_check_type",
      "fiscal_year_variant",
      "profit_center",
      "mrp_type",
    ],
    conflictTarget: "(product_id, plant_id)",
    logLabel: "product_plants",
    mapRow: (data) => [
      data.product,
      data.plant,
      toText(data.countryOfOrigin),
      toText(data.regionOfOrigin),
      toText(data.productionInvtryManagedLoc),
      toText(data.availabilityCheckType),
      toText(data.fiscalYearVariant),
      toText(data.profitCenter),
      toText(data.mrpType),
    ],
  });
}

async function seedProductStorageLocations() {
  await seedInsertDataset({
    datasetName: "product_storage_locations",
    table: "product_storage_locations",
    columns: [
      "product_id",
      "plant_id",
      "storage_location",
      "physical_inventory_block_indicator",
      "last_posted_count_at",
    ],
    conflictTarget: "(product_id, plant_id, storage_location)",
    logLabel: "product_storage_locations",
    mapRow: (data) => [
      data.product,
      data.plant,
      data.storageLocation,
      toText(data.physicalInventoryBlockInd),
      toTimestamp(data.dateOfLastPostedCntUnRstrcdStk),
    ],
  });
}

async function seedSalesOrderScheduleLines() {
  await seedInsertDataset({
    datasetName: "sales_order_schedule_lines",
    table: "sales_order_schedule_lines",
    columns: [
      "sales_order_id",
      "sales_order_item",
      "schedule_line",
      "confirmed_delivery_date",
      "order_quantity_unit",
      "confirmed_order_quantity",
    ],
    conflictTarget: "(sales_order_id, sales_order_item, schedule_line)",
    logLabel: "sales_order_schedule_lines",
    mapRow: (data) => [
      data.salesOrder,
      data.salesOrderItem,
      data.scheduleLine,
      toTimestamp(data.confirmedDeliveryDate),
      toText(data.orderQuantityUnit),
      toNumber(data.confdOrderQtyByMatlAvailCheck),
    ],
  });
}

async function run() {
  console.log(
    `Starting seed run with batch size ${BATCH_SIZE} against configured PostgreSQL database`
  );
  
  await seedProductPlants();
  await seedProductStorageLocations();
  await seedJournalEntries();
  await seedPayments();
}

run()
  .then(() => {
    console.log("Seed run completed successfully");
  })
  .catch((err) => {
    console.error("Seed run failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
