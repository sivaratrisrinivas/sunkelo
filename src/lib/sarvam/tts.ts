import { getSarvamClient, SarvamError } from "./client";
import { ttsRequestSchema, ttsResponseSchema } from "./types";

export class TTSError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TTSError";
  }
}

export type SynthesizeTTSParams = {
  text: string;
  languageCode: string;
  speaker?: string;
};

export async function synthesizeTts({
  text,
  languageCode,
  speaker = "shubh",
}: SynthesizeTTSParams): Promise<Buffer> {
  const payload = ttsRequestSchema.parse({
    text,
    target_language_code: languageCode,
    speaker,
    model: "bulbul:v3",
  });

  const client = getSarvamClient();
  const response = await client.request<unknown>("/text-to-speech", {
    method: "POST",
    headers: {
      "api-subscription-key": client.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const parsed = ttsResponseSchema.parse(response);

  try {
    return Buffer.from(parsed.audios.join(""), "base64");
  } catch {
    throw new TTSError("Invalid TTS audio payload");
  }
}

export function getWavDurationSeconds(buffer: Buffer): number | null {
  if (buffer.length < 44) {
    return null;
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  const sampleRate = buffer.readUInt32LE(24);
  const byteRate = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);

  if (sampleRate <= 0 || byteRate <= 0 || dataSize <= 0) {
    return null;
  }

  const seconds = dataSize / byteRate;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Number(seconds.toFixed(2));
}

export function mapTtsError(error: unknown): Error {
  if (error instanceof SarvamError) {
    return error;
  }
  if (error instanceof TTSError) {
    return error;
  }
  return new TTSError(error instanceof Error ? error.message : "Failed to synthesize TTS");
}
