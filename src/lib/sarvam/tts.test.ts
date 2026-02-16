import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequest = vi.fn();

vi.mock("./client", () => ({
  getSarvamClient: () => ({
    apiKey: "test-key",
    request: (...args: unknown[]) => mockRequest(...args),
  }),
}));

import { getWavDurationSeconds, synthesizeTts } from "./tts";

function createTinyWavBase64(): string {
  const sampleRate = 8000;
  const seconds = 1;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = byteRate * seconds;
  const chunkSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer.toString("base64");
}

describe("synthesizeTts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns audio buffer from Bulbul payload", async () => {
    const wavBase64 = createTinyWavBase64();
    mockRequest.mockResolvedValueOnce({
      request_id: "req-1",
      audios: [wavBase64],
    });

    const result = await synthesizeTts({
      text: "Namaste duniya",
      languageCode: "hi-IN",
      speaker: "shubh",
    });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString("ascii", 0, 4)).toBe("RIFF");
    expect(mockRequest).toHaveBeenCalledWith(
      "/text-to-speech",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

describe("getWavDurationSeconds", () => {
  it("parses duration from wav header", () => {
    const wav = Buffer.from(createTinyWavBase64(), "base64");
    expect(getWavDurationSeconds(wav)).toBe(1);
  });
});
