import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/hooks/use-audio-player", () => ({
  useAudioPlayer: () => ({
    isPlaying: false,
    isLoading: false,
    error: null,
    currentTime: 5,
    duration: 35,
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
  }),
}));

import { AudioPlayer } from "./audio-player";

describe("AudioPlayer", () => {
  it("renders play control and duration", () => {
    const html = renderToStaticMarkup(
      <AudioPlayer audioUrl="https://blob.example/audio.wav" durationSeconds={35} />,
    );

    expect(html).toContain("Audio summary");
    expect(html).toContain("Play audio summary");
    expect(html).toContain("0:05");
    expect(html).toContain("0:35");
  });
});
