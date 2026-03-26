const DEFAULT_QUERY_LIMIT = 50;
const MAX_CACHE_ENTRIES = 100;

function stripMarkdownFences(sql) {
  return String(sql || "")
    .replace(/```sql/gi, "")
    .replace(/```/g, "")
    .trim();
}

function isSelectQuery(sql) {
  return /^(select|with)\b/i.test(sql.trim());
}

function hasExplicitLimit(sql) {
  return /\blimit\s+\d+\b/i.test(sql);
}

function containsSelectStar(sql) {
  return /\bselect\s+(distinct\s+)?\*/i.test(sql);
}

function addDefaultLimit(sql, limit = DEFAULT_QUERY_LIMIT) {
  if (hasExplicitLimit(sql)) {
    return sql;
  }

  const trimmed = sql.trim().replace(/;+\s*$/, "");
  return `${trimmed} LIMIT ${limit};`;
}

function sanitizeGeneratedSQL(sql) {
  const cleaned = stripMarkdownFences(sql);

  if (!cleaned || !isSelectQuery(cleaned)) {
    throw new Error("Generated SQL was not a SELECT query.");
  }

  if (containsSelectStar(cleaned)) {
    throw new Error("Generated SQL used SELECT *.");
  }

  return addDefaultLimit(cleaned);
}

function compactRows(rows, maxColumns = 8) {
  return rows.map((row) => {
    const entries = Object.entries(row);
    if (entries.length <= maxColumns) {
      return row;
    }

    const preferredKeys = entries
      .map(([key]) => key)
      .filter((key) => /(^id$|_id$|name$|amount|status|date|created_at|currency)/i.test(key));

    const orderedKeys = [...new Set([...preferredKeys, ...entries.map(([key]) => key)])].slice(
      0,
      maxColumns
    );

    return orderedKeys.reduce((acc, key) => {
      acc[key] = row[key];
      return acc;
    }, {});
  });
}

function createMemoryCache(limit = MAX_CACHE_ENTRIES) {
  const cache = new Map();

  return {
    get(key) {
      return cache.get(key);
    },
    set(key, value) {
      if (cache.has(key)) {
        cache.delete(key);
      }

      cache.set(key, value);

      if (cache.size > limit) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    },
  };
}

module.exports = {
  DEFAULT_QUERY_LIMIT,
  compactRows,
  createMemoryCache,
  sanitizeGeneratedSQL,
};
