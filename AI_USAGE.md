# AI Usage & Prompt Engineering Log

## 1. SQL Generation from Natural Language

**Goal:** Convert user questions into SQL queries over O2C schema.

### Initial Approach

Prompted LLM to generate SQL directly from user question.

### Issue Faced

* Model generated incorrect columns (e.g., `i.amount` instead of `total_amount`)
* Sometimes wrapped SQL in ```sql markdown causing execution errors

### Fixes Applied

* Added strict schema constraints in prompt:

  * invoices(id, delivery_id, total_amount, is_cancelled)
* Added SQL cleaning step:

  * Removed `sql and ` before execution
* Added validation:

  * Ensured query contains SELECT

---

## 2. Ensuring Answer Accuracy (No Hallucination)

**Problem:** LLM was generating incorrect summaries not matching actual DB output.

### Fix

* Passed actual query result JSON into LLM
* Enforced rules:

  * "ONLY use provided data"
  * "Always use row count"
* Added `data.length` to prompt

### Result

* Responses became deterministic and grounded

---

## 3. Handling Query Failures

**Problem:** Some generated SQL queries failed due to schema mismatch

### Fix

* Implemented retry mechanism:

  * If query fails → regenerate SQL with stricter instruction

---

## 4. Data Debugging via AI

Used AI-assisted queries to identify:

* invoices without deliveries
* inconsistencies in dataset joins

This helped validate data ingestion pipeline and identify missing relationships.

---

## 5. Key Learning

* LLMs require strict schema grounding
* Never trust generated SQL without validation
* Passing actual data into prompts eliminates hallucinations
* Iterative prompt refinement is critical

---

## 6. Outcome

Built a system where:

* Natural language → SQL → validated execution → grounded answer
* Responses are consistent and reliable
