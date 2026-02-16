import { put } from "@vercel/blob";

type UploadTtsAudioInput = {
  productSlug: string;
  reviewId: number;
  languageCode: string;
  audio: Buffer;
};

export async function uploadTtsAudio(input: UploadTtsAudioInput): Promise<string> {
  const safeLanguage = input.languageCode.replace(/[^a-zA-Z0-9-]/g, "-");
  const filename = `tts/${input.productSlug}/${input.reviewId}-${safeLanguage}.wav`;
  const blob = await put(filename, input.audio, {
    access: "public",
    contentType: "audio/wav",
    addRandomSuffix: true,
  });

  return blob.url;
}
