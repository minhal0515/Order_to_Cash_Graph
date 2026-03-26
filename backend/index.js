// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { generateSQL, generateAnswer } = require("./llm");
const { createGraphBuilder } = require("./graph-builder");
const {
  compactRows,
  createMemoryCache,
  extractHighlightTokens,
  sanitizeGeneratedSQL,
} = require("./query-utils");

const app = express();
const { buildGraph } = createGraphBuilder(pool);
const queryCache = createMemoryCache();

app.use(
  cors()
);
app.use(express.json());

app.get("/graph", async (req, res) => {
  try {
    const view = req.query.view === "full" ? "full" : "initial";
    const graph = await buildGraph(view);
    res.json(graph);
  } catch (err) {
    console.error("Graph error:", err);
    res.status(500).json({
      nodes: [],
      links: [],
      meta: { error: "Graph error" },
    });
  }
});

app.get("/insights/missing-deliveries", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.id, i.delivery_id, i.customer_id, i.created_at
      FROM invoices i
      WHERE NOT EXISTS (
        SELECT 1
        FROM deliveries d
        WHERE d.id = i.delivery_id
      )
      LIMIT 20;
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Missing deliveries query failed:", error);
    res.status(500).json({ error: "Insights query failed" });
  }
});

app.post("/query", async (req, res) => {
  const { question } = req.body;
  const normalizedQuestion = String(question || "").trim().toLowerCase();

  if (
    !normalizedQuestion ||
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
    const cached = queryCache.get(normalizedQuestion);
    if (cached) {
      return res.json(cached);
    }

    const rawSql = await generateSQL(question);
    const sql = sanitizeGeneratedSQL(rawSql);
    const result = await pool.query(sql);
    const compactData = compactRows(result.rows);
    const answer = await generateAnswer(question, sql, compactData.slice(0, 10));
    const ids = extractHighlightTokens(result.rows);

    const payload = {
      answer,
      data: compactData,
      ids,
      meta: {
        rowCount: result.rows.length,
        limited: /\blimit\s+\d+\b/i.test(sql),
      },
    };

    queryCache.set(normalizedQuestion, payload);

    res.json(payload);

    console.log("FINAL SQL:", sql);
    console.log("Rows Count", result.rows.length);
    console.log("Rows", compactData.slice(0, 3));
  } catch (err) {
    console.error("Query failed:", err);
    res.status(500).json({ error: "Query failed", answer: "I could not complete that query safely." });
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running");
});
