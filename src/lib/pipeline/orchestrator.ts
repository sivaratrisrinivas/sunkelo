export type SSEEventType = "status" | "review" | "audio" | "error" | "done";

export type SSEEmitter = <T>(type: SSEEventType, data: T) => void;

export function createSSEStream(
  run: (emitEvent: SSEEmitter) => Promise<void> | void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitEvent: SSEEmitter = (type, data) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await run(emitEvent);
      } catch (error) {
        emitEvent("error", {
          code: "UNKNOWN",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });
}
