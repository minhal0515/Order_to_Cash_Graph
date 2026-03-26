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
  mergeGraphPayload,
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
      setData((current) => mergeGraphPayload(current, fullGraph));
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
      }}
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
        linkDirectionalArrowLength={3}
        nodeRelSize={6}
        cooldownTicks={100}
        d3VelocityDecay={0.3}
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
            background: "rgba(255,255,255,0.95)",
            padding: "10px 14px",
            cursor: "pointer",
          }}
        >
          {isLoading ? "Loading..." : "Load More"}
        </button>
      )}
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            right: 20,
            top: 20,
            background: "#111",
            color: "white",
            padding: "12px",
            borderRadius: "8px",
            width: "250px",
            border: "1px solid #333",
            zIndex: 10,
          }}
        >
          <h4>Node Details</h4>
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
