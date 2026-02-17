"use client";

import { VoiceInput } from "@/components/voice-input";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-5 py-16">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[500px] h-[350px] rounded-full bg-[var(--accent)] opacity-[0.04] blur-[120px]" />
      </div>

      <div className="z-10 mx-auto flex w-full max-w-xl flex-col items-center gap-16 text-center">
        <div className="space-y-4 animate-slide-up">
          <h1 className="text-6xl font-bold tracking-tight sm:text-7xl md:text-8xl">
            <span className="text-[var(--fg)]">Sunke</span>
            <span className="text-[var(--accent)]">Lo</span>
          </h1>
          <p className="text-[var(--fg-muted)] text-base sm:text-lg tracking-wide">
            Ask about any product. Get a spoken verdict in your language.
          </p>
        </div>

        <div className="w-full animate-slide-up [animation-delay:150ms] opacity-0">
          <VoiceInput onTranscript={() => { }} />
        </div>
      </div>
    </main>
  );
}
