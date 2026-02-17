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
      className="relative rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] transition-all duration-300"
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
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] transition-all duration-300 hover:brightness-110 active:scale-95 disabled:opacity-30"
          aria-label={player.isPlaying ? "Pause audio summary" : "Play audio summary"}
          disabled={!audioUrl}
        >
          {player.isPlaying ? (
            <div className="flex gap-0.5 items-end h-4">
              <div className="w-[3px] h-full bg-white rounded-full animate-wave-1 origin-bottom" />
              <div className="w-[3px] h-full bg-white rounded-full animate-wave-2 origin-bottom" />
              <div className="w-[3px] h-full bg-white rounded-full animate-wave-3 origin-bottom" />
            </div>
          ) : (
            <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--fg-faint)]">Audio Summary</span>
            <span className="text-[var(--fg-faint)] tabular-nums">
              {formatDuration(player.currentTime)} / {formatDuration(effectiveDuration)}
            </span>
          </div>

          <div className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--fg-faint)]/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {player.isLoading && !player.isPlaying ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--bg-surface)]/80">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--fg-faint)]/20 border-t-[var(--accent)]" />
        </div>
      ) : null}

      {player.error ? (
        <div className="px-4 pb-3 text-center text-xs text-[var(--color-skip)]">{player.error}</div>
      ) : null}
    </section>
  );
}
