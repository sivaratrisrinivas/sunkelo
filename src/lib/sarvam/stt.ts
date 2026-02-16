import { getSarvamClient, SarvamError } from "./client";
import { sttResponseSchema } from "./types";

export class STTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "STTError";
  }
}

export type STTResult = {
  transcript: string;
  languageCode: string;
  languageProbability: number;
};

export async function transcribeAudio(buffer: Buffer): Promise<STTResult> {
  const { apiKey, baseUrl } = getSarvamClient();
  const form = new FormData();
  const audioBytes = new Uint8Array(buffer);
  form.append("model", "saaras:v3");
  form.append("language_code", "unknown");
  form.append("file", new Blob([audioBytes], { type: "audio/webm" }), "query.webm");

  const response = await fetch(`${baseUrl}/speech-to-text`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
    },
    body: form,
  });

  if ([500, 503].includes(response.status)) {
    throw new SarvamError("Sarvam service unavailable", response.status);
  }

  if (!response.ok) {
    throw new STTError(`STT request failed with ${response.status}`);
  }

  const payload = sttResponseSchema.parse(await response.json());
  if (!payload.transcript.trim()) {
    throw new STTError("Empty transcript from STT");
  }

  return {
    transcript: payload.transcript.trim(),
    languageCode: payload.language_code,
    languageProbability: payload.language_probability,
  };
}
