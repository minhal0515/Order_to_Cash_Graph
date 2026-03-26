const GRAPH_LIMITS = {
  initial: {
    customers: 100,
    orders: 200,
    deliveries: 200,
    invoices: 200,
    journalEntries: 200,
    products: 100,
    payments: 200,
  },
  full: {
    customers: 100,
    orders: 200,
    deliveries: 200,
    invoices: 200,
    journalEntries: 200,
    products: 100,
    payments: 200,
  },
};

function createGraphBuilder(pool) {
  const graphCache = new Map();
  const graphPromiseCache = new Map();

  async function safeQuery(label, text, params = []) {
    try {
      const result = await pool.query(text, params);
      return result.rows;
    } catch (error) {
      console.error(`Graph query failed for ${label}:`, error);
      return [];
    }
  }

  function addNode(nodes, nodeSet, id, label, type, extra = {}) {
    if (!id || nodeSet.has(id)) {
      return;
    }

    nodes.push({ id, label, type, ...extra });
    nodeSet.add(id);
  }

  function addLink(links, linkSet, nodeSet, source, target, type) {
    if (!source || !target || !nodeSet.has(source) || !nodeSet.has(target)) {
      return;
    }

    const key = `${source}|${target}|${type}`;
    if (linkSet.has(key)) {
      return;
    }

    links.push({ source, target, type });
    linkSet.add(key);
  }

  function getNodeTypeAndValue(nodeId) {
    const value = String(nodeId || "").trim();
    const match = value.match(/^(customer|order|delivery|invoice|product|plant|payment|journal_entry)_(.+)$/);

    if (!match) {
      return null;
    }

    return { type: match[1], value: match[2] };
  }

  function createEmptyGraph(meta = {}) {
    return {
      nodes: [],
      links: [],
      meta,
    };
  }

  async function buildExpandedGraph(nodeId) {
    const parsed = getNodeTypeAndValue(nodeId);
    if (!parsed) {
      return createEmptyGraph({ expandedFrom: nodeId, error: "Unsupported node id" });
    }

    const { type, value } = parsed;
    const nodes = [];
    const links = [];
    const nodeSet = new Set();
    const linkSet = new Set();

    const addCustomerNode = (customer) => {
      if (!customer?.id) return;
      addNode(nodes, nodeSet, `customer_${customer.id}`, customer.name || `Customer ${customer.id}`, "customer", {
        customer_id: customer.id,
      });
    };

    const addOrderNode = (order) => {
      if (!order?.id) return;
      addNode(nodes, nodeSet, `order_${order.id}`, `Order ${order.id}`, "order", {
        order_id: order.id,
        customer_id: order.customer_id,
      });
    };

    const addDeliveryNode = (delivery) => {
      if (!delivery?.id) return;
      addNode(nodes, nodeSet, `delivery_${delivery.id}`, `Delivery ${delivery.id}`, "delivery", {
        delivery_id: delivery.id,
        order_id: delivery.order_id,
      });
    };

    const addInvoiceNode = (invoice) => {
      if (!invoice?.id) return;
      addNode(nodes, nodeSet, `invoice_${invoice.id}`, `Invoice ${invoice.id}`, "invoice", {
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        delivery_id: invoice.delivery_id,
      });
    };

    const addProductNode = (product) => {
      if (!product?.id) return;
      addNode(
        nodes,
        nodeSet,
        `product_${product.id}`,
        product.label || product.name || `Product ${product.id}`,
        "product",
        { product_id: product.id }
      );
    };

    const addPlantNode = (plant) => {
      if (!plant?.id) return;
      addNode(nodes, nodeSet, `plant_${plant.id}`, plant.name || `Plant ${plant.id}`, "plant", {
        plant_id: plant.id,
      });
    };

    const addPaymentNode = (payment) => {
      if (!payment?.accounting_document) return;
      addNode(
        nodes,
        nodeSet,
        `payment_${payment.company_code}_${payment.fiscal_year}_${payment.accounting_document}_${payment.accounting_document_item}`,
        `Payment ${payment.accounting_document}`,
        "payment",
        {
          accounting_document: payment.accounting_document,
          invoice_id: payment.invoice_id,
        }
      );
    };

    const addJournalEntryNode = (entry) => {
      if (!entry?.accounting_document) return;
      addNode(
        nodes,
        nodeSet,
        `journal_entry_${entry.company_code}_${entry.fiscal_year}_${entry.accounting_document}_${entry.accounting_document_item}`,
        `Journal ${entry.accounting_document}`,
        "journal_entry",
        {
          accounting_document: entry.accounting_document,
          reference_document: entry.reference_document,
        }
      );
    };

    if (type === "customer") {
      const [customers, orders, invoices] = await Promise.all([
        safeQuery("expand_customer", "SELECT id, name FROM customers WHERE id = $1", [value]),
        safeQuery(
          "expand_customer_orders",
          "SELECT id, customer_id FROM sales_orders WHERE customer_id = $1 ORDER BY created_at DESC NULLS LAST, id LIMIT 100",
          [value]
        ),
        safeQuery(
          "expand_customer_invoices",
          "SELECT id, delivery_id, customer_id FROM invoices WHERE customer_id = $1 ORDER BY created_at DESC NULLS LAST, id LIMIT 100",
          [value]
        ),
      ]);

      customers.forEach(addCustomerNode);
      orders.forEach((order) => {
        addOrderNode(order);
        addLink(links, linkSet, nodeSet, `customer_${order.customer_id}`, `order_${order.id}`, "places");
      });
      invoices.forEach((invoice) => {
        addInvoiceNode(invoice);
        addLink(links, linkSet, nodeSet, `customer_${invoice.customer_id}`, `invoice_${invoice.id}`, "billed_to");
      });
    }

    if (type === "order") {
      const [orders, customers, deliveries, products] = await Promise.all([
        safeQuery("expand_order", "SELECT id, customer_id FROM sales_orders WHERE id = $1", [value]),
        safeQuery(
          "expand_order_customer",
          `SELECT c.id, c.name
           FROM customers c
           JOIN sales_orders so ON so.customer_id = c.id
           WHERE so.id = $1`,
          [value]
        ),
        safeQuery(
          "expand_order_deliveries",
          "SELECT id, order_id FROM deliveries WHERE order_id = $1 ORDER BY created_at DESC NULLS LAST, id LIMIT 100",
          [value]
        ),
        safeQuery(
          "expand_order_products",
          `SELECT DISTINCT p.id, COALESCE(pd.product_description, p.name, p.id) AS label
           FROM sales_order_items soi
           JOIN products p ON p.id = soi.product_id
           LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.language = 'EN'
           WHERE soi.order_id = $1
           LIMIT 100`,
          [value]
        ),
      ]);

      orders.forEach(addOrderNode);
      customers.forEach(addCustomerNode);
      deliveries.forEach(addDeliveryNode);
      products.forEach(addProductNode);

      orders.forEach((order) => {
        addLink(links, linkSet, nodeSet, `customer_${order.customer_id}`, `order_${order.id}`, "places");
      });
      deliveries.forEach((delivery) => {
        addLink(links, linkSet, nodeSet, `order_${delivery.order_id}`, `delivery_${delivery.id}`, "fulfilled_by");
      });
      products.forEach((product) => {
        addLink(links, linkSet, nodeSet, `order_${value}`, `product_${product.id}`, "contains_product");
      });
    }

    if (type === "delivery") {
      const [deliveries, orders, invoices] = await Promise.all([
        safeQuery("expand_delivery", "SELECT id, order_id FROM deliveries WHERE id = $1", [value]),
        safeQuery(
          "expand_delivery_order",
          `SELECT so.id, so.customer_id
           FROM sales_orders so
           JOIN deliveries d ON d.order_id = so.id
           WHERE d.id = $1`,
          [value]
        ),
        safeQuery(
          "expand_delivery_invoices",
          "SELECT id, delivery_id, customer_id FROM invoices WHERE delivery_id = $1 ORDER BY created_at DESC NULLS LAST, id LIMIT 100",
          [value]
        ),
      ]);

      deliveries.forEach(addDeliveryNode);
      orders.forEach(addOrderNode);
      invoices.forEach(addInvoiceNode);

      deliveries.forEach((delivery) => {
        addLink(links, linkSet, nodeSet, `order_${delivery.order_id}`, `delivery_${delivery.id}`, "fulfilled_by");
      });
      invoices.forEach((invoice) => {
        addLink(links, linkSet, nodeSet, `invoice_${invoice.id}`, `delivery_${invoice.delivery_id}`, "references_delivery");
      });
    }

    if (type === "invoice") {
      const [invoices, deliveries, customers, payments, journalEntries] = await Promise.all([
        safeQuery("expand_invoice", "SELECT id, delivery_id, customer_id FROM invoices WHERE id = $1", [value]),
        safeQuery(
          "expand_invoice_delivery",
          `SELECT d.id, d.order_id
           FROM deliveries d
           JOIN invoices i ON i.delivery_id = d.id
           WHERE i.id = $1`,
          [value]
        ),
        safeQuery(
          "expand_invoice_customer",
          `SELECT c.id, c.name
           FROM customers c
           JOIN invoices i ON i.customer_id = c.id
           WHERE i.id = $1`,
          [value]
        ),
        safeQuery(
          "expand_invoice_payments",
          `SELECT accounting_document, company_code, fiscal_year, accounting_document_item, invoice_id
           FROM payments
           WHERE invoice_id = $1
           ORDER BY posting_date DESC NULLS LAST, accounting_document
           LIMIT 100`,
          [value]
        ),
        safeQuery(
          "expand_invoice_journals",
          `SELECT accounting_document, company_code, fiscal_year, accounting_document_item, reference_document
           FROM journal_entries
           WHERE reference_document = $1
           ORDER BY posting_date DESC NULLS LAST, accounting_document
           LIMIT 100`,
          [value]
        ),
      ]);

      invoices.forEach(addInvoiceNode);
      deliveries.forEach(addDeliveryNode);
      customers.forEach(addCustomerNode);
      payments.forEach(addPaymentNode);
      journalEntries.forEach(addJournalEntryNode);

      invoices.forEach((invoice) => {
        addLink(links, linkSet, nodeSet, `invoice_${invoice.id}`, `delivery_${invoice.delivery_id}`, "references_delivery");
        addLink(links, linkSet, nodeSet, `customer_${invoice.customer_id}`, `invoice_${invoice.id}`, "billed_to");
      });
      payments.forEach((payment) => {
        addLink(
          links,
          linkSet,
          nodeSet,
          `invoice_${payment.invoice_id}`,
          `payment_${payment.company_code}_${payment.fiscal_year}_${payment.accounting_document}_${payment.accounting_document_item}`,
          "settled_by"
        );
      });
      journalEntries.forEach((entry) => {
        addLink(
          links,
          linkSet,
          nodeSet,
          `invoice_${entry.reference_document}`,
          `journal_entry_${entry.company_code}_${entry.fiscal_year}_${entry.accounting_document}_${entry.accounting_document_item}`,
          "posted_to"
        );
      });
    }

    if (type === "product") {
      const [products, plants] = await Promise.all([
        safeQuery(
          "expand_product",
          `SELECT p.id, COALESCE(pd.product_description, p.name, p.id) AS label
           FROM products p
           LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.language = 'EN'
           WHERE p.id = $1`,
          [value]
        ),
        safeQuery(
          "expand_product_plants",
          `SELECT DISTINCT p.id, p.name
           FROM plants p
           JOIN product_plants pp ON pp.plant_id = p.id
           WHERE pp.product_id = $1
           LIMIT 100`,
          [value]
        ),
      ]);

      products.forEach(addProductNode);
      plants.forEach(addPlantNode);
      plants.forEach((plant) => {
        addLink(links, linkSet, nodeSet, `product_${value}`, `plant_${plant.id}`, "available_at");
      });
    }

    if (type === "plant") {
      const [plants, products] = await Promise.all([
        safeQuery("expand_plant", "SELECT id, name FROM plants WHERE id = $1", [value]),
        safeQuery(
          "expand_plant_products",
          `SELECT DISTINCT p.id, COALESCE(pd.product_description, p.name, p.id) AS label
           FROM products p
           JOIN product_plants pp ON pp.product_id = p.id
           LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.language = 'EN'
           WHERE pp.plant_id = $1
           LIMIT 100`,
          [value]
        ),
      ]);

      plants.forEach(addPlantNode);
      products.forEach(addProductNode);
      products.forEach((product) => {
        addLink(links, linkSet, nodeSet, `product_${product.id}`, `plant_${value}`, "available_at");
      });
    }

    if (type === "payment") {
      const parts = value.split("_");
      if (parts.length >= 4) {
        const [companyCode, fiscalYear, accountingDocument, accountingDocumentItem] = parts;
        const [payments, invoices] = await Promise.all([
          safeQuery(
            "expand_payment",
            `SELECT accounting_document, company_code, fiscal_year, accounting_document_item, invoice_id
             FROM payments
             WHERE company_code = $1 AND fiscal_year = $2 AND accounting_document = $3 AND accounting_document_item = $4`,
            [companyCode, fiscalYear, accountingDocument, accountingDocumentItem]
          ),
          safeQuery(
            "expand_payment_invoice",
            `SELECT i.id, i.delivery_id, i.customer_id
             FROM invoices i
             JOIN payments p ON p.invoice_id = i.id
             WHERE p.company_code = $1 AND p.fiscal_year = $2 AND p.accounting_document = $3 AND p.accounting_document_item = $4`,
            [companyCode, fiscalYear, accountingDocument, accountingDocumentItem]
          ),
        ]);

        payments.forEach(addPaymentNode);
        invoices.forEach(addInvoiceNode);
        payments.forEach((payment) => {
          addLink(
            links,
            linkSet,
            nodeSet,
            `invoice_${payment.invoice_id}`,
            `payment_${payment.company_code}_${payment.fiscal_year}_${payment.accounting_document}_${payment.accounting_document_item}`,
            "settled_by"
          );
        });
      }
    }

    if (type === "journal_entry") {
      const parts = value.split("_");
      if (parts.length >= 4) {
        const [companyCode, fiscalYear, accountingDocument, accountingDocumentItem] = parts;
        const [entries, invoices] = await Promise.all([
          safeQuery(
            "expand_journal",
            `SELECT accounting_document, company_code, fiscal_year, accounting_document_item, reference_document
             FROM journal_entries
             WHERE company_code = $1 AND fiscal_year = $2 AND accounting_document = $3 AND accounting_document_item = $4`,
            [companyCode, fiscalYear, accountingDocument, accountingDocumentItem]
          ),
          safeQuery(
            "expand_journal_invoice",
            `SELECT i.id, i.delivery_id, i.customer_id
             FROM invoices i
             JOIN journal_entries je ON je.reference_document = i.id
             WHERE je.company_code = $1 AND je.fiscal_year = $2 AND je.accounting_document = $3 AND je.accounting_document_item = $4`,
            [companyCode, fiscalYear, accountingDocument, accountingDocumentItem]
          ),
        ]);

        entries.forEach(addJournalEntryNode);
        invoices.forEach(addInvoiceNode);
        entries.forEach((entry) => {
          addLink(
            links,
            linkSet,
            nodeSet,
            `invoice_${entry.reference_document}`,
            `journal_entry_${entry.company_code}_${entry.fiscal_year}_${entry.accounting_document}_${entry.accounting_document_item}`,
            "posted_to"
          );
        });
      }
    }

    return {
      nodes,
      links,
      meta: {
        expandedFrom: nodeId,
        counts: {
          nodes: nodes.length,
          links: links.length,
        },
      },
    };
  }

  async function buildGraph(view = "initial") {
    const selectedView = GRAPH_LIMITS[view] ? view : "initial";
    const key = selectedView;

    if (graphCache.has(key)) {
      return graphCache.get(key);
    }

    if (graphPromiseCache.has(key)) {
      return graphPromiseCache.get(key);
    }

    const limits = GRAPH_LIMITS[selectedView];

    const buildPromise = (async () => {
      const nodes = [];
      const links = [];
      const nodeSet = new Set();
      const linkSet = new Set();

      const [
        customers,
        orders,
        deliveries,
        invoices,
        products,
        productPlants,
        plants,
        payments,
        journalEntries,
      ] = await Promise.all([
        safeQuery(
          "customers",
          "SELECT id, name FROM customers ORDER BY created_at DESC NULLS LAST, id LIMIT $1",
          [limits.customers]
        ),
        safeQuery(
          "sales_orders",
          "SELECT id, customer_id FROM sales_orders ORDER BY created_at DESC NULLS LAST, id LIMIT $1",
          [limits.orders]
        ),
        safeQuery(
          "deliveries",
          "SELECT id, order_id, status FROM deliveries ORDER BY created_at DESC NULLS LAST, id LIMIT $1",
          [limits.deliveries]
        ),
        safeQuery(
          "invoices",
          "SELECT id, delivery_id, customer_id, total_amount, currency FROM invoices ORDER BY created_at DESC NULLS LAST, id LIMIT $1",
          [limits.invoices]
        ),
        safeQuery(
          "products",
          `SELECT p.id, COALESCE(pd.product_description, p.name, p.id) AS label
           FROM products p
           LEFT JOIN product_descriptions pd
             ON pd.product_id = p.id
            AND pd.language = 'EN'
           ORDER BY p.created_at DESC NULLS LAST, p.id
           LIMIT $1`,
          [limits.products]
        ),
        safeQuery(
          "product_plants",
          `SELECT product_id, plant_id
           FROM product_plants
           WHERE product_id IN (
             SELECT id
             FROM products
             ORDER BY created_at DESC NULLS LAST, id
             LIMIT $1
           )`,
          [limits.products]
        ),
        safeQuery(
          "plants",
          `SELECT DISTINCT p.id, p.name
           FROM plants p
           JOIN product_plants pp ON pp.plant_id = p.id
           WHERE pp.product_id IN (
             SELECT id
             FROM products
             ORDER BY created_at DESC NULLS LAST, id
             LIMIT $1
           )
           LIMIT $2`,
          [limits.products, limits.products]
        ),
        safeQuery(
          "payments",
          `SELECT accounting_document, company_code, fiscal_year, accounting_document_item, invoice_id
           FROM payments
           WHERE invoice_id IS NOT NULL
           ORDER BY posting_date DESC NULLS LAST, accounting_document
           LIMIT $1`,
          [limits.payments]
        ),
        safeQuery(
          "journal_entries",
          `SELECT accounting_document, company_code, fiscal_year, accounting_document_item, reference_document
           FROM journal_entries
           WHERE reference_document IS NOT NULL
           ORDER BY posting_date DESC NULLS LAST, accounting_document
           LIMIT $1`,
          [limits.journalEntries]
        ),
      ]);

      customers.forEach((customer) => {
        addNode(
          nodes,
          nodeSet,
          `customer_${customer.id}`,
          customer.name || `Customer ${customer.id}`,
          "customer",
          { customer_id: customer.id }
        );
      });

      orders.forEach((order) => {
        const orderId = `order_${order.id}`;
        addNode(nodes, nodeSet, orderId, `Order ${order.id}`, "order", { order_id: order.id });
        addLink(links, linkSet, nodeSet, `customer_${order.customer_id}`, orderId, "places");
      });

      deliveries.forEach((delivery) => {
        const deliveryId = `delivery_${delivery.id}`;
        addNode(nodes, nodeSet, deliveryId, `Delivery ${delivery.id}`, "delivery", {
          delivery_id: delivery.id,
          order_id: delivery.order_id,
        });
        addLink(links, linkSet, nodeSet, `order_${delivery.order_id}`, deliveryId, "fulfilled_by");
      });

      invoices.forEach((invoice) => {
        const invoiceId = `invoice_${invoice.id}`;
        addNode(nodes, nodeSet, invoiceId, `Invoice ${invoice.id}`, "invoice", {
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          delivery_id: invoice.delivery_id,
        });
        addLink(links, linkSet, nodeSet, invoiceId, `delivery_${invoice.delivery_id}`, "references_delivery");
        addLink(links, linkSet, nodeSet, `customer_${invoice.customer_id}`, invoiceId, "billed_to");
      });

      products.forEach((product) => {
        addNode(nodes, nodeSet, `product_${product.id}`, product.label || `Product ${product.id}`, "product", {
          product_id: product.id,
        });
      });

      plants.forEach((plant) => {
        addNode(nodes, nodeSet, `plant_${plant.id}`, plant.name || `Plant ${plant.id}`, "plant", {
          plant_id: plant.id,
        });
      });

      productPlants.forEach((productPlant) => {
        addLink(
          links,
          linkSet,
          nodeSet,
          `product_${productPlant.product_id}`,
          `plant_${productPlant.plant_id}`,
          "available_at"
        );
      });

      payments.forEach((payment) => {
        const paymentId = `payment_${payment.company_code}_${payment.fiscal_year}_${payment.accounting_document}_${payment.accounting_document_item}`;
        addNode(nodes, nodeSet, paymentId, `Payment ${payment.accounting_document}`, "payment", {
          accounting_document: payment.accounting_document,
          invoice_id: payment.invoice_id,
        });
        addLink(links, linkSet, nodeSet, `invoice_${payment.invoice_id}`, paymentId, "settled_by");
      });

      journalEntries.forEach((entry) => {
        const journalId = `journal_entry_${entry.company_code}_${entry.fiscal_year}_${entry.accounting_document}_${entry.accounting_document_item}`;
        addNode(nodes, nodeSet, journalId, `Journal ${entry.accounting_document}`, "journal_entry", {
          accounting_document: entry.accounting_document,
          reference_document: entry.reference_document,
        });
        addLink(links, linkSet, nodeSet, `invoice_${entry.reference_document}`, journalId, "posted_to");
      });

      const graph = {
        nodes,
        links,
        meta: {
          view: selectedView,
          cached: true,
          counts: {
            nodes: nodes.length,
            links: links.length,
          },
        },
      };

      graphCache.set(key, graph);
      graphPromiseCache.delete(key);
      return graph;
    })().catch((error) => {
      graphPromiseCache.delete(key);
      throw error;
    });

    graphPromiseCache.set(key, buildPromise);
    return buildPromise;
  }

  return { buildGraph, buildExpandedGraph };
}

module.exports = {
  GRAPH_LIMITS,
  createGraphBuilder,
};
