"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type Message = {
  role: "user" | "ai";
  text: string;
};

type ChatPanelProps = {
  setHighlightIdsAction: Dispatch<SetStateAction<string[]>>;
};

export default function ChatPanel({ setHighlightIdsAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const send = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);

    const res = await fetch("https://order-to-cash-graph-u5wv.onrender.com/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question: input }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // Backend may return plain text on error; keep UI usable.
      data = { answer: await res.text().catch(() => "Request failed"), ids: [] };
    }

    if (data.ids && data.ids.length > 0) {
      setHighlightIdsAction(data.ids.map((id: string | number) => String(id)));
    } else {
      setHighlightIdsAction([]);
    }

    const aiMessage: Message = {
      role: "ai",
      text: data.answer,
    };
    if (!res.ok) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "I generated an invalid query. Please try rephrasing.",
        },
      ]);
      return;
    }
    console.log("API_RESPONSE", data);
    console.log("IDS_FROM_BACKEDN", data.ids);
    setMessages((prev) => [...prev, aiMessage]);
    setInput("");
  };

  return (
    <div
      style={{
        height: "100%",
        background: "#0f0f0f",
        color: "white",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "15px", borderBottom: "1px solid #222" }}>
        <h3>Dodge AI</h3>
        <p style={{ fontSize: "12px", color: "#aaa" }}>
          Ask about Order to Cash
        </p>
      </div>

      {/* Chat */}
      <div
        style={{
          flex: 1,
          padding: "20px",
          overflowY: "auto",
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                background:
                  msg.role === "user" ? "#2563eb" : "#1f1f1f",
                padding: "10px 14px",
                borderRadius: "10px",
                maxWidth: "60%",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "15px",
          borderTop: "1px solid #222",
          display: "flex",
          gap: "10px",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#111",
            color: "white",
          }}
        />

        <button
          onClick={send}
          style={{
            padding: "10px 16px",
            background: "#2563eb",
            border: "none",
            borderRadius: "8px",
            color: "white",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
