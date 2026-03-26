"use client";

import { useState } from "react";
import ChatPanel from "../components/chatpanel";

export default function ChatPage() {
  const [, setHighlightIds] = useState<string[]>([]);

  return (
    <div style={{ height: "100vh" }}>
      <ChatPanel setHighlightIdsAction={setHighlightIds} />
    </div>
  );
}
