import { upsertAudioAsset } from "@/lib/db/audio-assets";

type UploadTtsAudioInput = {
  productSlug: string;
  reviewId: number;
  languageCode: string;
  audio: Buffer;
};

export async function uploadTtsAudio(input: UploadTtsAudioInput): Promise<string> {
  const safeLanguage = input.languageCode.replace(/[^a-zA-Z0-9-]/g, "-");
  const audioKey = `${input.productSlug}-${input.reviewId}-${safeLanguage}`.toLowerCase();
  await upsertAudioAsset({
    audioKey,
    reviewId: input.reviewId > 0 ? input.reviewId : null,
    languageCode: input.languageCode,
    mimeType: "audio/wav",
    audioBase64: input.audio.toString("base64"),
    byteSize: input.audio.length,
  });

  return `/api/audio/${audioKey}`;
}
