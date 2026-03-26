"use client";

import dynamic from "next/dynamic";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import {
  getGraph,
  normalizeGraphId,
  type GraphPayload,
  type GraphNode,
} from "../lib/graph-store";
import { useElementSize } from "../lib/use-element-size";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div style={{ padding: "24px" }}>Loading graph...</div>,
});

type GraphViewProps = {
  highlightIds?: string[];
};

export default function GraphView({ highlightIds = [] }: GraphViewProps) {
  const [data, setData] = useState<GraphPayload>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedFullGraph, setHasLoadedFullGraph] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const graphSize = useElementSize(containerRef.current);
  const deferredHighlightIds = useDeferredValue(highlightIds);

  const mergeGraphData = (previous: GraphPayload, next: GraphPayload): GraphPayload => {
    const nodeMap = new Map(previous.nodes.map((node) => [node.id, node]));
    next.nodes.forEach((node) => {
      nodeMap.set(node.id, node);
    });

    const linkMap = new Map(
      previous.links.map((link) => {
        const source = typeof link.source === "string" ? link.source : String(link.source);
        const target = typeof link.target === "string" ? link.target : String(link.target);
        return [`${source}->${target}`, link] as const;
      })
    );

    next.links.forEach((link) => {
      const source = typeof link.source === "string" ? link.source : String(link.source);
      const target = typeof link.target === "string" ? link.target : String(link.target);
      linkMap.set(`${source}->${target}`, link);
    });

    return {
      nodes: Array.from(nodeMap.values()),
      links: Array.from(linkMap.values()),
      meta: next.meta ?? previous.meta,
    };
  };

  useEffect(() => {
    let alive = true;

    getGraph("initial")
      .then((json) => {
        if (!alive) {
          return;
        }

        setData(json);
        setError(json.meta?.error ?? null);
      })
      .catch((err) => {
        console.error(err);
        if (alive) {
          setError("Unable to load graph data.");
        }
      })
      .finally(() => {
        if (alive) {
          setIsLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const highlightSet = useMemo(() => {
    return new Set(
      deferredHighlightIds.flatMap((value) => {
        const stringValue = String(value);
        return [stringValue, normalizeGraphId(stringValue)];
      })
    );
  }, [deferredHighlightIds]);

  const stableGraphData = useMemo(() => data, [data]);

  useEffect(() => {
    if (!highlightSet.size || !graphRef.current) {
      return;
    }

    const highlightedNode = stableGraphData.nodes.find((node) => {
      return highlightSet.has(node.id) || highlightSet.has(normalizeGraphId(node.id));
    });

    if (highlightedNode) {
      graphRef.current.centerAt(
        Number(highlightedNode.x ?? 0),
        Number(highlightedNode.y ?? 0),
        500
      );
      graphRef.current.zoom(2.2, 500);
    }
  }, [highlightSet, stableGraphData]);

  const loadMore = async () => {
    if (hasLoadedFullGraph) {
      return;
    }

    try {
      setIsLoading(true);
      const fullGraph = await getGraph("full");
      setData((previous) => mergeGraphData(previous, fullGraph));
      setHasLoadedFullGraph(true);
    } catch (loadError) {
      console.error(loadError);
      setError("Unable to load the expanded graph.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
        zIndex: 0,
        background: "white",
      }}
      onClick={() => setSelectedNode(null)}
    >
      {isLoading && stableGraphData.nodes.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 2 }}>
          Loading graph...
        </div>
      )}
      {error && !stableGraphData.nodes.length && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 2 }}>
          {error}
        </div>
      )}
      <ForceGraph2D
        ref={graphRef}
        graphData={stableGraphData}
        nodeLabel="label"
        nodeAutoColorBy="type"
        linkColor={() => "rgba(0,0,0,0.15)"}
        linkWidth={1}
        linkDirectionalArrowLength={3}
        nodeRelSize={5}
        cooldownTicks={100}
        d3VelocityDecay={0.3}
        d3AlphaDecay={0.05}
        autoPauseRedraw
        nodeCanvasObjectMode={(node) => {
          const nodeId = String(node.id ?? "");
          return highlightSet.has(nodeId) || highlightSet.has(normalizeGraphId(nodeId))
            ? "after"
            : undefined;
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const nodeId = String(node.id ?? "");
          if (!highlightSet.has(nodeId) && !highlightSet.has(normalizeGraphId(nodeId))) {
            const fillStyle =
              node.type === "invoice"
                ? "#2563eb"
                : node.type === "delivery"
                ? "#22c55e"
                : node.type === "journal_entry"
                ? "#f59e0b"
                : "#94a3b8";

            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, 4.5, 0, 2 * Math.PI, false);
            ctx.fillStyle = fillStyle;
            ctx.fill();
            return;
          }

          const fillStyle =
            node.type === "invoice"
              ? "#2563eb"
              : node.type === "delivery"
              ? "#22c55e"
              : node.type === "journal_entry"
              ? "#f59e0b"
              : "#94a3b8";

          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI, false);
          ctx.fillStyle = fillStyle;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#ef4444";
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.lineWidth = 2 / globalScale;
          ctx.strokeStyle = "#ef4444";
          ctx.stroke();
        }}
        onEngineStop={() => {
          if (graphRef.current && stableGraphData.nodes.length > 0) {
            graphRef.current.zoomToFit(400, 40);
          }
        }}
        onNodeClick={(node) => setSelectedNode(node as GraphNode)}
        width={graphSize.width || 800}
        height={graphSize.height || 600}
        backgroundColor="white"
      />
      {!hasLoadedFullGraph && stableGraphData.nodes.length > 0 && (
        <button
          onClick={loadMore}
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            zIndex: 3,
            border: "1px solid #d1d5db",
            borderRadius: "999px",
            background: "rgba(55, 19, 198, 0.95)",
            padding: "10px 14px",
            cursor: "pointer",
          }}
        >
          {isLoading ? "Loading..." : "Load More"}
        </button>
      )}
      {selectedNode && (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            right: 20,
            top: 20,
            background: "rgba(255,255,255,0.98)",
            color: "#0f172a",
            padding: "16px",
            borderRadius: "14px",
            width: "250px",
            border: "1px solid rgba(148,163,184,0.35)",
            boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
            zIndex: 10,
          }}
        >
          <button
            onClick={() => setSelectedNode(null)}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              border: "none",
              background: "transparent",
              color: "#475569",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            ✕
          </button>
          <h4 style={{ margin: "0 0 12px" }}>Node Details</h4>
          {Object.entries(selectedNode).map(([key, value]) => (
            <div key={key} style={{ fontSize: "12px", marginBottom: "4px" }}>
              <strong>{key}:</strong> {String(value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
