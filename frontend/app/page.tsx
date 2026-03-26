"use client";

import { useState } from "react";
import GraphView from "./components/graphview";
import ChatPanel from "./components/chatpanel";

export default function Home() {
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      
      {/* GRAPH */}
      <div style={{ flex: 3, minWidth: 0, minHeight: 0 }}>
        <GraphView highlightIds={highlightIds} />
      </div>

      {/* CHAT */}
      <div style={{
        width: "350px",
        borderLeft: "1px solid #222",
        background: "#0f0f0f",
        position: "relative",
        zIndex: 1,
      }}>
        <ChatPanel setHighlightIdsAction={setHighlightIds} />
      </div>

    </div>
  );
}
