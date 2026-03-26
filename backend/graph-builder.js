const GRAPH_LIMITS = {
  initial: {
    customers: 50,
    orders: 100,
    deliveries: 100,
    invoices: 100,
    journalEntries: 100,
    products: 50,
    payments: 100,
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

  function addNode(nodes, nodeSet, id, label, type) {
    if (!id || nodeSet.has(id)) {
      return;
    }

    nodes.push({ id, label, type });
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
        addNode(nodes, nodeSet, `customer_${customer.id}`, customer.name || `Customer ${customer.id}`, "customer");
      });

      orders.forEach((order) => {
        const orderId = `order_${order.id}`;
        addNode(nodes, nodeSet, orderId, `Order ${order.id}`, "order");
        addLink(links, linkSet, nodeSet, `customer_${order.customer_id}`, orderId, "places");
      });

      deliveries.forEach((delivery) => {
        const deliveryId = `delivery_${delivery.id}`;
        addNode(nodes, nodeSet, deliveryId, `Delivery ${delivery.id}`, "delivery");
        addLink(links, linkSet, nodeSet, `order_${delivery.order_id}`, deliveryId, "fulfilled_by");
      });

      invoices.forEach((invoice) => {
        const invoiceId = `invoice_${invoice.id}`;
        addNode(nodes, nodeSet, invoiceId, `Invoice ${invoice.id}`, "invoice");
        addLink(links, linkSet, nodeSet, invoiceId, `delivery_${invoice.delivery_id}`, "references_delivery");
        addLink(links, linkSet, nodeSet, `customer_${invoice.customer_id}`, invoiceId, "billed_to");
      });

      products.forEach((product) => {
        addNode(nodes, nodeSet, `product_${product.id}`, product.label || `Product ${product.id}`, "product");
      });

      plants.forEach((plant) => {
        addNode(nodes, nodeSet, `plant_${plant.id}`, plant.name || `Plant ${plant.id}`, "plant");
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
        addNode(nodes, nodeSet, paymentId, `Payment ${payment.accounting_document}`, "payment");
        addLink(links, linkSet, nodeSet, `invoice_${payment.invoice_id}`, paymentId, "settled_by");
      });

      journalEntries.forEach((entry) => {
        const journalId = `journal_entry_${entry.company_code}_${entry.fiscal_year}_${entry.accounting_document}_${entry.accounting_document_item}`;
        addNode(nodes, nodeSet, journalId, `Journal ${entry.accounting_document}`, "journal_entry");
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

  return { buildGraph };
}

module.exports = {
  GRAPH_LIMITS,
  createGraphBuilder,
};
