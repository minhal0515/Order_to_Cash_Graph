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
  [key: string]: unknown;
};

export default function GraphView({ highlightIds = [] }: GraphViewProps) {
  const [data, setData] = useState({ nodes: [], links: [] });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;

    fetch("http://localhost:5000/graph")
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

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative", zIndex: 0 }}
    >
      {containerRef.current && (
        <ForceGraph2D
          graphData={data}
          nodeAutoColorBy="type"
          linkDirectionalArrowLength={3}
          nodeRelSize={6}
          nodeColor={(node: any) => {
            const rawId = String(node.id ?? "").replace("invoice_", "");
        
            if (!highlightIds.length) return "#3b82f6";
        
            if (highlightIds.includes(rawId)) {
              return "#ef4444";
            }
        
            return "rgba(255,255,255,0.1)";
          }}
          width={containerRef.current.offsetWidth}
          height={containerRef.current.offsetHeight}
          backgroundColor="white"
        />
      )}
    </div>
  );
}