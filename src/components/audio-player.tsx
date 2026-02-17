"use client";

import { useMemo } from "react";

import { useAudioPlayer } from "@/hooks/use-audio-player";

type AudioPlayerProps = {
  audioUrl: string;
  durationSeconds?: number | null;
  onPlay?: () => void;
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const rounded = Math.floor(seconds);
  const mins = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${mins}:${remaining.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ audioUrl, durationSeconds, onPlay }: AudioPlayerProps) {
  const player = useAudioPlayer(audioUrl);

  const effectiveDuration = useMemo(() => {
    if (typeof player.duration === "number" && player.duration > 0) {
      return player.duration;
    }
    if (typeof durationSeconds === "number" && durationSeconds > 0) {
      return durationSeconds;
    }
    return 0;
  }, [durationSeconds, player.duration]);

  const progress =
    effectiveDuration > 0 ? Math.min((player.currentTime / effectiveDuration) * 100, 100) : 0;

  return (
    <section
      className="glass relative overflow-hidden rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl"
      aria-label="Audio summary"
    >
      <div className="flex items-center gap-4 p-4">
        <button
          type="button"
          onClick={async () => {
            if (!player.isPlaying) {
              onPlay?.();
            }
            await player.toggle();
          }}
          className="group flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 shadow-md transition-all duration-300 hover:bg-rose-600 hover:shadow-lg active:scale-95 disabled:opacity-50"
          aria-label={player.isPlaying ? "Pause audio summary" : "Play audio summary"}
          disabled={!audioUrl}
        >
          {player.isPlaying ? (
            <div className="flex gap-1 items-end h-5">
              <div className="w-1 bg-white rounded-full animate-pulse" />
              <div className="w-1 bg-white rounded-full animate-pulse [animation-delay:0.1s]" />
              <div className="w-1 bg-white rounded-full animate-pulse [animation-delay:0.2s]" />
            </div>
          ) : (
            <svg
              className="ml-0.5 h-6 w-6 text-white transition-transform duration-300 group-hover:scale-110"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-gray-500">Audio Summary</span>
            <span className="text-gray-400">
              {formatDuration(player.currentTime)} / {formatDuration(effectiveDuration)}
            </span>
          </div>

          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {player.isLoading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/75">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
        </div>
      ) : null}

      {player.error ? (
        <div className="px-4 pb-3 text-center text-xs text-red-500">{player.error}</div>
      ) : null}
    </section>
  );
}
