import { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/cache/rate-limit";
import { createSSEStream } from "@/lib/pipeline/orchestrator";
import { transcribeAudio } from "@/lib/sarvam/stt";
import { MAX_AUDIO_UPLOAD_BYTES } from "@/lib/utils/constants";
import { hashIpFromHeader } from "@/lib/utils/ip-hash";

type QueryPayload =
  | { kind: "text"; text: string }
  | { kind: "audio"; audio: Buffer }
  | { kind: "invalid"; message: string };

async function parsePayload(request: NextRequest): Promise<QueryPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => ({}));
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (!text) {
      return { kind: "invalid", message: "Text query cannot be empty" };
    }
    return { kind: "text", text };
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return { kind: "invalid", message: "Audio file is required" };
    }
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      return { kind: "invalid", message: "Audio file exceeds 10MB limit" };
    }
    const arrayBuffer = await file.arrayBuffer();
    return { kind: "audio", audio: Buffer.from(arrayBuffer) };
  }

  return { kind: "invalid", message: "Unsupported content type" };
}

export async function POST(request: NextRequest) {
  const ipHash = hashIpFromHeader(request.headers.get("x-forwarded-for"));
  const rate = await checkRateLimit(ipHash);

  const stream = createSSEStream(async (emitEvent) => {
    if (!rate.allowed) {
      emitEvent("error", {
        code: "RATE_LIMITED",
        message: "Daily query limit reached",
        remaining: rate.remaining,
        resetAt: rate.resetAt,
      });
      emitEvent("done", { cached: false, remaining: rate.remaining });
      return;
    }

    const payload = await parsePayload(request);
    if (payload.kind === "invalid") {
      emitEvent("error", { code: "INVALID_INPUT", message: payload.message });
      emitEvent("done", { cached: false, remaining: rate.remaining });
      return;
    }

    emitEvent("status", { status: "listening" });

    if (payload.kind === "text") {
      emitEvent("status", {
        status: "understood",
        context: { transcript: payload.text, language: "en-IN" },
      });
      emitEvent("done", { cached: false, remaining: rate.remaining });
      return;
    }

    try {
      const stt = await transcribeAudio(payload.audio);
      emitEvent("status", {
        status: "understood",
        context: { transcript: stt.transcript, language: stt.languageCode },
      });
      emitEvent("done", { cached: false, remaining: rate.remaining });
    } catch (error) {
      emitEvent("error", {
        code: "STT_FAILED",
        message: error instanceof Error ? error.message : "Failed to transcribe audio",
      });
      emitEvent("done", { cached: false, remaining: rate.remaining });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
