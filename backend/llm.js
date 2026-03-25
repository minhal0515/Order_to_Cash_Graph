const Groq = require("groq-sdk");
require("dotenv").config();
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function generateSQL(question) {
  const prompt = `
You are a PostgreSQL expert.

Database schema:

Table: invoices
- id (string)
- delivery_id (string)
- customer_id (string)
- created_at (timestamp)
- total_amount (number)
- currency (string)
- is_cancelled (boolean)

Table: deliveries
- id (string)
- order_id (string)
- created_at (timestamp)
- status (string)
- shipping_point (string)

Relationship:
- invoices.delivery_id = deliveries.id

Interpret business intent carefully:

- If a query refers to missing relationships, check for missing JOIN matches
- If an invoice is "missing" something, verify whether the related record exists
- If a query implies expected data (e.g., "should have"), assume valid business records should exist unless cancelled
- Cancelled invoices may not require further processing

SQL Rules:

- ONLY use the given tables and columns
- DO NOT invent columns
- DO NOT use invoice_date (use created_at)
- DO NOT add extra conditions unless explicitly asked
- For "with deliveries", use JOIN only
- For "without deliveries", use LEFT JOIN + IS NULL
- ALWAYS return i.id when listing invoices
- Do NOT return multiple id columns
- Output must be pure SQL ONLY
- Do NOT include markdown or explanations

Examples (follow these patterns exactly):

User: Find invoices without deliveries
SQL:
SELECT i.id
FROM invoices i
LEFT JOIN deliveries d ON i.delivery_id = d.id
WHERE d.id IS NULL;

User: Show invoices with deliveries
SQL:
SELECT i.id
FROM invoices i
JOIN deliveries d ON i.delivery_id = d.id;

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
  - If results exist → explain what they show
  - Always use the provided count
  - Be concise
  - If empty → clearly say no results found
  - Keep answer short and factual
  - If interpretation is uncertain, briefly state assumption
  Now answer:
  `;
  
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    });
  
    return response.choices[0].message.content;
  }  
  module.exports = { generateSQL, generateAnswer };

