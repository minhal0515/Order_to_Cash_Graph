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
    fetch("http://localhost:5000/graph")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
    >
      {containerRef.current && (
        <ForceGraph2D
          graphData={data}
          nodeAutoColorBy="type"
          linkDirectionalArrowLength={3}
          nodeRelSize={6}
          nodeColor={(node: any) => {
            const rawId = String(node.id ?? "").replace("invoice_", "");
        
            if (!highlightIds.length) return "#999999";
        
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