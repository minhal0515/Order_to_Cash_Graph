// backend/index.js
require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors({
  origin: "http://localhost:3000",
}));
app.use(express.json());
const pool = require("./db");

app.get("/graph", async (req, res) => {
  try {
    const nodes = [];
    const links = [];
    const nodeSet = new Set(); // 🔥 track existing nodes

    // 1. Customers
    const customers = await pool.query("SELECT id, name FROM customers");
    customers.rows.forEach(c => {
      const nodeId = `customer_${c.id}`;

      nodes.push({
        id: nodeId,
        label: c.name,
        type: "customer"
      });

      nodeSet.add(nodeId);
    });

    // 2. Orders
    const orders = await pool.query("SELECT id, customer_id FROM sales_orders");
    orders.rows.forEach(o => {
      const orderNode = `order_${o.id}`;
      const customerNode = `customer_${o.customer_id}`;

      nodes.push({
        id: orderNode,
        label: `Order ${o.id}`,
        type: "order"
      });

      nodeSet.add(orderNode);

      // 🔥 Only link if customer exists
      if (nodeSet.has(customerNode)) {
        links.push({
          source: customerNode,
          target: orderNode,
          type: "places"
        });
      } else {
        console.warn("Missing customer for order:", o.id);
      }
    });

    // 3. Deliveries
    const deliveries = await pool.query("SELECT id, order_id FROM deliveries");
    deliveries.rows.forEach(d => {
      const deliveryNode = `delivery_${d.id}`;
      const orderNode = `order_${d.order_id}`;

      nodes.push({
        id: deliveryNode,
        label: `Delivery ${d.id}`,
        type: "delivery"
      });

      nodeSet.add(deliveryNode);

      // 🔥 Only link if order exists
      if (nodeSet.has(orderNode)) {
        links.push({
          source: orderNode,
          target: deliveryNode,
          type: "fulfilled_by"
        });
      } else {
        console.warn("Missing order for delivery:", d.id);
      }
    });

    // 4. Invoices
    const invoices = await pool.query("SELECT id, delivery_id FROM invoices");
    invoices.rows.forEach(i => {
      const invoiceNode = `invoice_${i.id}`;
      const deliveryNode = `delivery_${i.delivery_id}`;

      nodes.push({
        id: invoiceNode,
        label: `Invoice ${i.id}`,
        type: "invoice"
      });

      nodeSet.add(invoiceNode);

      // 🔥 CRITICAL FIX
      if (nodeSet.has(deliveryNode)) {
        links.push({
          source: deliveryNode,
          target: invoiceNode,
          type: "billed_as"
        });
      } else {
        console.warn("Missing delivery for invoice:", i.id);
      }
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
const { generateSQL , generateAnswer} = require("./llm");

app.post("/query", async (req, res) => {
  const { question } = req.body;

  // 🔒 Guardrails
  if (!question.toLowerCase().includes("order") &&
      !question.toLowerCase().includes("invoice") &&
      !question.toLowerCase().includes("customer") &&
      !question.toLowerCase().includes("delivery") &&
      !question.toLowerCase().includes("deliveries")
    ) {
    return res.json({
      answer: "This system only supports queries related to the dataset."
    });
  }

  try {
    let sql = await generateSQL(question);
    sql = sql
      .replace(/```sql/g, "")
      .replace(/```/g, "")
      .trim();
      if (!sql.toLowerCase().includes("select")) {
        return res.json({
          answer: "Invalid query generated. Please try again.",
        });
      }
      const result = await pool.query(sql);

      const answer = await generateAnswer(question, sql, result.rows);
      const ids = result.rows.map(row => row.id);

    res.json({
      answer,
      data: result.rows,
      ids,
    });
    console.log("FINAL SQL:", sql);
    console.log("Rows Count", result.rows.length);
    console.log("Rows", result.rows.slice(0,3));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Query failed" });
  }

});
app.listen(5000, () => {
  console.log("Server running on port 5000");
});