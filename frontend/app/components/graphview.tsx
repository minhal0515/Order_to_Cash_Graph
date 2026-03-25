"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

type GraphViewProps = {
  highlightIds?: string[];
};

type GraphNode = {
  id?: string | number;
  x?: number;
  y?: number;
  type?: string;
  [key: string]: unknown;
};

export default function GraphView({ highlightIds = [] }: GraphViewProps) {
  const [data, setData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;

    fetch("https://order-to-cash-graph-u5wv.onrender.com")
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Graph fetch failed (${res.status}): ${text}`);
        }
        return res.json();
      })
      .then((json) => {
        if (!alive) return;
        setData(json);
      })
      .catch((err) => {
        // Don't crash the whole page if backend returns an error.
        console.error(err);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      setGraphSize({
        width: containerRef.current?.offsetWidth || 800,
        height: containerRef.current?.offsetHeight || 600,
      });
    };

    updateSize();

    if (!containerRef.current || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative", zIndex: 0 }}
    >
      <ForceGraph2D
        graphData={data}
        linkDirectionalArrowLength={3}
        nodeRelSize={6}
        nodeCanvasObject={(graphNode, ctx, globalScale) => {
          console.log("NODE ID:", graphNode.id);
          const rawId = String(graphNode.id ?? "");
          const normalizedId = rawId.replace(/^invoice_/, "");
        
          const isHighlighted =
            highlightIds.includes(rawId) ||
            highlightIds.includes(normalizedId);
        
          const radius = isHighlighted ? 9 : 4;
        
          ctx.globalAlpha =
            highlightIds.length > 0 && !isHighlighted ? 0.2 : 1;
        
          ctx.beginPath();
          ctx.arc(graphNode.x ?? 0, graphNode.y ?? 0, radius, 0, 2 * Math.PI);
        
          ctx.fillStyle = isHighlighted
            ? "#ef4444"
            : graphNode.type === "invoice"
            ? "#3b82f6"
            : graphNode.type === "delivery"
            ? "#22c55e"
            : "#9ca3af";
        
          ctx.fill();
        
          if (isHighlighted) {
            ctx.lineWidth = 2 / globalScale;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          }
        }}
        onNodeClick={(node) => setSelectedNode(node as GraphNode)}
        width={graphSize.width}
        height={graphSize.height}
        backgroundColor="white"
      />
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
