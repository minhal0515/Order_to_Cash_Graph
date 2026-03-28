# Order to Cash Graph

Interactive Order-to-Cash graph explorer with an AI chat assistant for tracing document flows, spotting broken process chains, and answering dataset-grounded questions over the O2C schema.

Live deployment: [https://order-to-cash-graph.vercel.app/](https://order-to-cash-graph.vercel.app/)

![Order to Cash Graph UI](./graph-check-3.png)

## What This Project Does

- Visualizes Order-to-Cash entities and relationships in a force-directed graph.
- Lets users ask natural-language questions from the UI chat panel.
- Converts supported questions into PostgreSQL `SELECT` queries over the project dataset.
- Returns grounded answers and highlights the related nodes in the graph.

## Stack

- Frontend: Next.js 16, React 19, `react-force-graph-2d`
- Backend: Express, PostgreSQL, Groq API

## Architecture Decisions

- The project is split into a `frontend` and `backend` so graph rendering, chat interaction, SQL generation, and database access stay clearly separated.
- The frontend is responsible for visualization and interaction only: rendering the graph, opening node details, expanding nodes, and sending chat questions.
- The backend is responsible for graph construction and query execution: loading entities from the dataset, building node-edge relationships, generating SQL from natural language, executing the SQL, and returning grounded answers.
- Graph data is exposed through dedicated API routes rather than embedding database access in the frontend. This keeps credentials and query logic on the server side.
- The graph model favors business entities and business-process links over raw table browsing, so the UI reflects Order-to-Cash flows rather than just table joins.

## Database Choice

- PostgreSQL is used as the system of record for the Order-to-Cash dataset.
- This fits the project well because the data is relational and the core questions depend on joins across entities such as customers, sales orders, deliveries, invoices, payments, products, plants, and journal entries.
- Using PostgreSQL also makes natural-language-to-SQL practical, since the LLM can target a well-defined schema and the backend can validate and execute standard `SELECT` queries safely.
- The backend connects through `DATABASE_URL`, and all user-visible answers are grounded in executed database results.

## LLM Prompting Strategy

- The backend uses the LLM for two narrow tasks: generating SQL from a user question and summarizing the returned query results.
- The SQL-generation prompt includes the allowed schema, known relationships, hard rules, and concrete examples so the model stays anchored to the actual dataset.
- The answer-generation prompt does not let the model invent results. It receives the question, the generated SQL, row count, and a sample of the actual returned rows, then produces a short factual answer.
- This split keeps the model focused: one prompt turns language into a query, and a second prompt turns query output into a readable response.

## Guardrails

- Only dataset-related questions are accepted by the backend.
- Generated SQL must be a `SELECT` or `WITH` query.
- `SELECT *` is rejected.
- The SQL prompt explicitly forbids invented tables, columns, and relationships.
- A default `LIMIT` is applied when the model does not provide one.
- Answers are generated from returned query data, not from model memory alone.
- Highlighted graph nodes are derived from query result identifiers so the UI stays tied to the underlying data.

## Project Structure

- `frontend/`: Next.js app with the graph view and chat panel
- `backend/`: Express API for graph data and question answering
- `AI_USAGE.md`: notes on prompt design and AI usage decisions

## Environment Variables

Backend (`backend/.env` or root `.env`):

```env
DATABASE_URL=your_postgres_connection_string
GROQ_API_KEY=your_groq_api_key
PORT=5000
```

Frontend optional override:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

If `NEXT_PUBLIC_API_BASE_URL` is not set, the frontend defaults to the deployed backend URL already configured in the app.

## Run Locally

Install dependencies:

```bash
npm install
cd frontend
npm install
```

Start the backend:

```bash
cd backend
node index.js
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Open the app at `http://localhost:3000`.

## Example Questions To Try

Use these in the chat panel while the project is running:

1. Which products are associated with the highest number of billing documents?
2. Trace the full flow of a given billing document (Sales Order → Delivery → Billing → Journal Entry)
3. Identify sales orders that have broken or incomplete flows (e.g. delivered but not billed, billed without delivery)
4. 91150187 - Find the journal entry linked to this.

## Notes

- The backend only supports Order-to-Cash dataset questions.
- Generated SQL is constrained to the known schema and then executed against PostgreSQL.
- Answers are based on query results returned by the backend, not free-form chat responses.
