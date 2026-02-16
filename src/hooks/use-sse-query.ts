"use client";

import { useCallback, useState } from "react";

type QueryState = "idle" | "streaming" | "complete" | "error";

type SSEHandler = (event: { type: string; data: unknown }) => void;

export function useSSEQuery() {
  const [state, setState] = useState<QueryState>("idle");
  const [error, setError] = useState<string | null>(null);

  const sendQuery = useCallback(
    async (payload: FormData | { text: string }, onEvent?: SSEHandler): Promise<void> => {
      const processBlock = (block: string) => {
        const eventMatch = block.match(/^event:\s*(.+)$/m);
        const dataMatch = block.match(/^data:\s*(.+)$/m);
        if (!eventMatch || !dataMatch) return;

        const eventType = eventMatch[1].trim();
        const parsedData = JSON.parse(dataMatch[1]);
        onEvent?.({ type: eventType, data: parsedData });

        if (eventType === "error") {
          setState("error");
          setError(parsedData?.message ?? "Unknown stream error");
        }
        if (eventType === "done") {
          setState("complete");
        }
      };

      setState("streaming");
      setError(null);

      const response = await fetch("/api/query", {
        method: "POST",
        headers: payload instanceof FormData ? undefined : { "Content-Type": "application/json" },
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        setState("error");
        setError("Failed to start query stream");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          processBlock(block);
        }

        if (done) {
          const finalBlock = buffer.trim();
          if (finalBlock) {
            processBlock(finalBlock);
          }
          break;
        }
      }
    },
    [],
  );

  return { state, error, sendQuery };
}
