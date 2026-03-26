"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { fetchJson } from "../lib/api";

type Message = {
  role: "user" | "ai";
  text: string;
};

type ChatPanelProps = {
  setHighlightIdsAction: Dispatch<SetStateAction<string[]>>;
};

type QueryResponse = {
  answer?: string;
  ids?: Array<string | number>;
};

export default function ChatPanel({ setHighlightIdsAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }

      abortRef.current?.abort();
    };
  }, []);

  const send = () => {
    const question = input.trim();
    if (!question || isSending) {
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      const userMessage: Message = { role: "user", text: question };
      startTransition(() => {
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
      });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setIsSending(true);

        const data = await fetchJson<QueryResponse>("/query", {
          method: "POST",
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });

        startTransition(() => {
          setHighlightIdsAction(
            (data.ids ?? []).map((id) => String(id))
          );
          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              text: data.answer || "No answer returned.",
            },
          ]);
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        console.error(error);
        startTransition(() => {
          setHighlightIdsAction([]);
          setMessages((prev) => [
            ...prev,
            {
              role: "ai",
              text: "I could not complete that request. Please try rephrasing it.",
            },
          ]);
        });
      } finally {
        setIsSending(false);
      }
    }, 250);
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
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              send();
            }
          }}
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
          disabled={!canSend}
          style={{
            padding: "10px 16px",
            background: canSend ? "#2563eb" : "#334155",
            border: "none",
            borderRadius: "8px",
            color: "white",
            cursor: canSend ? "pointer" : "not-allowed",
          }}
        >
          {isSending ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}
