import { getDbClient } from "./client";

type UpsertAudioAssetInput = {
  audioKey: string;
  reviewId?: number | null;
  languageCode: string;
  mimeType: string;
  audioBase64: string;
  byteSize: number;
  durationSeconds?: number | null;
};

type AudioAssetRow = {
  audio_key: string;
  mime_type: string;
  audio_base64: string;
  byte_size: number;
  duration_seconds: number | null;
};

export async function upsertAudioAsset(input: UpsertAudioAssetInput): Promise<void> {
  const sql = getDbClient();
  await sql`
    INSERT INTO review_audio_assets (
      audio_key, review_id, language_code, mime_type, audio_base64, byte_size, duration_seconds
    ) VALUES (
      ${input.audioKey},
      ${input.reviewId ?? null},
      ${input.languageCode},
      ${input.mimeType},
      ${input.audioBase64},
      ${input.byteSize},
      ${input.durationSeconds ?? null}
    )
    ON CONFLICT (audio_key)
    DO UPDATE SET
      mime_type = EXCLUDED.mime_type,
      audio_base64 = EXCLUDED.audio_base64,
      byte_size = EXCLUDED.byte_size,
      duration_seconds = EXCLUDED.duration_seconds
  `;
}

export async function getAudioAsset(audioKey: string): Promise<AudioAssetRow | null> {
  const sql = getDbClient();
  const rows = (await sql`
    SELECT audio_key, mime_type, audio_base64, byte_size, duration_seconds
    FROM review_audio_assets
    WHERE audio_key = ${audioKey}
    LIMIT 1
  `) as AudioAssetRow[];
  return rows[0] ?? null;
}
