// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { generateSQL, generateAnswer } = require("./llm");

const app = express();

app.use(
  cors({
    origin: "http://localhost:3000",
  })
);
app.use(express.json());

app.get("/graph", async (req, res) => {
  try {
    const nodes = [];
    const links = [];
    const nodeSet = new Set();
    const linkSet = new Set();

    const addNode = (id, label, type) => {
      if (!id || nodeSet.has(id)) {
        return;
      }

      nodes.push({ id, label, type });
      nodeSet.add(id);
    };

    const addLink = (source, target, type) => {
      if (!source || !target || !nodeSet.has(source) || !nodeSet.has(target)) {
        return;
      }

      const key = `${source}|${target}|${type}`;
      if (linkSet.has(key)) {
        return;
      }

      links.push({ source, target, type });
      linkSet.add(key);
    };

    const customers = await pool.query("SELECT id, name FROM customers");
    customers.rows.forEach((customer) => {
      addNode(
        `customer_${customer.id}`,
        customer.name || `Customer ${customer.id}`,
        "customer"
      );
    });

    const orders = await pool.query("SELECT id, customer_id FROM sales_orders");
    orders.rows.forEach((order) => {
      const orderNode = `order_${order.id}`;
      addNode(orderNode, `Order ${order.id}`, "order");
      addLink(`customer_${order.customer_id}`, orderNode, "places");
    });

    const deliveries = await pool.query("SELECT id, order_id FROM deliveries");
    deliveries.rows.forEach((delivery) => {
      const deliveryNode = `delivery_${delivery.id}`;
      addNode(deliveryNode, `Delivery ${delivery.id}`, "delivery");
      addLink(`order_${delivery.order_id}`, deliveryNode, "fulfilled_by");
    });

    const invoices = await pool.query("SELECT id, delivery_id, customer_id FROM invoices");
    invoices.rows.forEach((invoice) => {
      const invoiceNode = `invoice_${invoice.id}`;
      addNode(invoiceNode, `Invoice ${invoice.id}`, "invoice");
      addLink(invoiceNode, `delivery_${invoice.delivery_id}`, "references_delivery");
      addLink(`customer_${invoice.customer_id}`, invoiceNode, "billed_to");
    });

    const products = await pool.query(`
      SELECT p.id, COALESCE(pd.product_description, p.name, p.id) AS label
      FROM products p
      LEFT JOIN product_descriptions pd
        ON pd.product_id = p.id
       AND pd.language = 'EN'
    `);
    products.rows.forEach((product) => {
      addNode(`product_${product.id}`, product.label || `Product ${product.id}`, "product");
    });

    const plants = await pool.query("SELECT id, name FROM plants");
    plants.rows.forEach((plant) => {
      addNode(`plant_${plant.id}`, plant.name || `Plant ${plant.id}`, "plant");
    });

    const productPlants = await pool.query("SELECT product_id, plant_id FROM product_plants");
    productPlants.rows.forEach((productPlant) => {
      addLink(
        `product_${productPlant.product_id}`,
        `plant_${productPlant.plant_id}`,
        "available_at"
      );
    });

    const payments = await pool.query(
      `SELECT company_code, fiscal_year, accounting_document, accounting_document_item, invoice_id
       FROM payments`
    );
    payments.rows.forEach((payment) => {
      const paymentNode = `payment_${payment.company_code}_${payment.fiscal_year}_${payment.accounting_document}_${payment.accounting_document_item}`;
      addNode(paymentNode, `Payment ${payment.accounting_document}`, "payment");
      addLink(`invoice_${payment.invoice_id}`, paymentNode, "settled_by");
    });

    const journalEntries = await pool.query(
      `SELECT company_code, fiscal_year, accounting_document, accounting_document_item, reference_document
       FROM journal_entries`
    );
    journalEntries.rows.forEach((entry) => {
      const journalNode = `journal_entry_${entry.company_code}_${entry.fiscal_year}_${entry.accounting_document}_${entry.accounting_document_item}`;
      addNode(journalNode, `Journal ${entry.accounting_document}`, "journal_entry");
      addLink(`invoice_${entry.reference_document}`, journalNode, "posted_to");
    });

    res.json({ nodes, links });
  } catch (err) {
    console.error(err);
    res.status(500).send("Graph error");
  }
});

app.get("/insights/missing-deliveries", async (req, res) => {
  const result = await pool.query(`
SELECT *
FROM invoices i
WHERE NOT EXISTS (
  SELECT 1
  FROM deliveries d
  WHERE d.id = i.delivery_id
)
LIMIT 20;
  `);

  res.json(result.rows);
});

app.post("/query", async (req, res) => {
  const { question } = req.body;
  const normalizedQuestion = String(question || "").toLowerCase();

  if (
    !normalizedQuestion.includes("order") &&
    !normalizedQuestion.includes("invoice") &&
    !normalizedQuestion.includes("customer") &&
    !normalizedQuestion.includes("delivery") &&
    !normalizedQuestion.includes("deliveries") &&
    !normalizedQuestion.includes("payment") &&
    !normalizedQuestion.includes("journal") &&
    !normalizedQuestion.includes("product") &&
    !normalizedQuestion.includes("plant")
  ) {
    return res.json({
      answer: "This system only supports queries related to the dataset.",
    });
  }

  try {
    let sql = await generateSQL(question);
    sql = sql.replace(/```sql/g, "").replace(/```/g, "").trim();

    if (!sql.toLowerCase().includes("select")) {
      return res.json({
        answer: "Invalid query generated. Please try again.",
      });
    }

    const result = await pool.query(sql);
    const answer = await generateAnswer(question, sql, result.rows);
    const ids = result.rows.map((row) => row.id).filter(Boolean);

    res.json({
      answer,
      data: result.rows,
      ids,
    });

    console.log("FINAL SQL:", sql);
    console.log("Rows Count", result.rows.length);
    console.log("Rows", result.rows.slice(0, 3));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Query failed" });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
