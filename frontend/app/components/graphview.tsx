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

const NODE_TYPE_COLORS: Record<string, string> = {
  customer: "#0f766e",
  order: "#7c3aed",
  delivery: "#16a34a",
  invoice: "#2563eb",
  product: "#f59e0b",
  plant: "#8b5cf6",
  payment: "#dc2626",
  journal_entry: "#64748b",
};

type GraphViewProps = {
  highlightIds?: string[];
};

export default function GraphView({ highlightIds = [] }: GraphViewProps) {
  const [data, setData] = useState<GraphPayload>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const hasAutoFitRef = useRef(false);
  const graphSize = useElementSize(containerElement);
  const deferredHighlightIds = useDeferredValue(highlightIds);

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
  type ForceGraphNodeLike = {
    id?: string | number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number;
    fy?: number;
    // Library node objects can carry arbitrary extra fields; we only use `type` for coloring.
    type?: string;
    [key: string]: unknown;
  };
  const nodeColor = useMemo(
    () =>
      (node: ForceGraphNodeLike) =>
        NODE_TYPE_COLORS[String(node.type ?? "")] ?? "#94a3b8",
    []
  );

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

  useEffect(() => {
    if (!graphRef.current) {
      return;
    }

    // Keep the layout compact, but allow a bit more separation between groups.
    graphRef.current.d3Force("charge")?.strength(-14).distanceMax(145);
    graphRef.current.d3Force("link")?.distance(19);
    graphRef.current.d3Force("center")?.strength(0.2);
  }, [stableGraphData]);

  return (
    <div
      ref={setContainerElement}
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
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          padding: "18px 24px",
          background: "rgba(255,255,255,0.96)",
          borderBottom: "1px solid rgba(148,163,184,0.2)",
          boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "24px",
            fontWeight: 600,
            color: "#0f172a",
          }}
        >
          Order to Cash
        </h2>
      </div>
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
        nodeColor={nodeColor}
        linkColor={() => "rgba(0,0,0,0.15)"}
        linkWidth={1}
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
            return;
          }

          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI, false);
          ctx.shadowBlur = 10 / globalScale;
          ctx.shadowColor = "#ef4444";
          ctx.lineWidth = 2 / globalScale;
          ctx.strokeStyle = "#ef4444";
          ctx.stroke();
          ctx.shadowBlur = 0;
        }}
        
        onEngineStop={() => {
          if (graphRef.current && stableGraphData.nodes.length > 0 && !hasAutoFitRef.current) {
            hasAutoFitRef.current = true;
            graphRef.current.zoomToFit(400, 0);
          }
        }}
        onNodeClick={(node) => setSelectedNode(node as GraphNode)}
        width={graphSize.width || 800}
        height={Math.max(graphSize.height || 600, 200)}
        backgroundColor="white"
      />
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
