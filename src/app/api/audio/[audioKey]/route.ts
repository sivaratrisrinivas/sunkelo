import { NextRequest } from "next/server";

import { getAudioAsset } from "@/lib/db/audio-assets";

type RouteContext = {
  params: Promise<{ audioKey: string }>;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { audioKey } = await context.params;
  if (!audioKey) {
    return new Response("Missing audio key", { status: 400 });
  }

  const asset = await getAudioAsset(audioKey);
  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Buffer.from(asset.audio_base64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": asset.mime_type || "audio/wav",
      "Cache-Control": "public, max-age=86400",
      "Content-Length": String(bytes.length),
    },
  });
}
