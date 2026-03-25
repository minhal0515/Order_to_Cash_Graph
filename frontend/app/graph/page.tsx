
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div style={{ height: "100vh" }} />,
});

type GraphNode = {
  id?: string | number;
  label?: string;
  type?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
};

export default function GraphPage() {
  const [data, setData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  useEffect(() => {
    fetch("http://localhost:5000/graph")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div style={{ height: "100vh" }}>
      <ForceGraph2D
  graphData={data}
  onNodeClick={node => setSelectedNode(node)}
  nodeLabel="label"
  nodeAutoColorBy="type"
  linkDirectionalArrowLength={3}
/>
      {selectedNode && (
  <div style={{
    position: "absolute",
    top: 20,
    right: 20,
    background: "#111",
    padding: "10px",
    color: "white"
  }}>
    <h3>{selectedNode.label}</h3>
    <p>Type: {selectedNode.type}</p>
  </div>
)}
    </div>
  );
}