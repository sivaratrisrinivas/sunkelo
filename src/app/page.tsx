"use client";

import { VoiceInput } from "@/components/voice-input";
import { useState } from "react";

export default function Home() {
  const [transcript, setTranscript] = useState<string>("");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-bold tracking-tight sm:text-7xl">SunkeLo</h1>
        <p className="text-sm text-zinc-300 sm:text-base">
          कोई भी फोन पूछो · ಯಾವುದೇ ಫೋನ್ ಕೇಳಿ · যেকোনো ফোন জিজ্ঞাসা করুন
        </p>
        <p className="max-w-xl text-zinc-400">
          Voice-powered mobile review assistant. Tap the mic and ask in your language.
        </p>
        <VoiceInput onTranscript={setTranscript} />
        {transcript ? <p className="text-sm text-zinc-300">Got it: {transcript}</p> : null}
      </div>
    </main>
  );
}
