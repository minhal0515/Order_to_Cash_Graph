import { fetchJson } from "./api";

export type GraphNode = {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
};

export type GraphLink = {
  source: string;
  target: string;
  type: string;
};

export type GraphPayload = {
  nodes: GraphNode[];
  links: GraphLink[];
  meta?: {
    view?: string;
    cached?: boolean;
    counts?: {
      nodes: number;
      links: number;
    };
    error?: string;
  };
};

const graphRequestCache = new Map<string, Promise<GraphPayload>>();

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function uniqueLinks(links: GraphLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const source = typeof link.source === "string" ? link.source : String(link.source);
    const target = typeof link.target === "string" ? link.target : String(link.target);
    const key = `${source}|${target}|${link.type}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function getGraph(view: "initial" | "full" = "initial") {
  if (!graphRequestCache.has(view)) {
    graphRequestCache.set(
      view,
      fetchJson<GraphPayload>(`/graph?view=${view}`).catch((error) => {
        graphRequestCache.delete(view);
        throw error;
      })
    );
  }

  return graphRequestCache.get(view)!;
}

export function getExpandedGraph(nodeId: string) {
  return fetchJson<GraphPayload>(`/graph/expand?id=${encodeURIComponent(nodeId)}`);
}

export function cloneGraphPayload(graph: GraphPayload): GraphPayload {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    links: graph.links.map((link) => ({ ...link })),
    meta: graph.meta
      ? {
          ...graph.meta,
          counts: graph.meta.counts ? { ...graph.meta.counts } : undefined,
        }
      : undefined,
  };
}

export function mergeGraphPayload(base: GraphPayload, next: GraphPayload): GraphPayload {
  return {
    nodes: uniqueById([...base.nodes, ...next.nodes]),
    links: uniqueLinks([...base.links, ...next.links]),
    meta: next.meta ?? base.meta,
  };
}

export function normalizeGraphId(value: string) {
  return value.replace(/^(invoice|order|delivery|customer|product|plant|payment|journal_entry)_/, "");
}
