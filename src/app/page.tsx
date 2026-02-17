"use client";

import { VoiceInput } from "@/components/voice-input";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-gradient-to-b from-rose-100 to-transparent blur-3xl opacity-60" />
        <div className="absolute right-10 bottom-20 w-[300px] h-[200px] rounded-full bg-gradient-to-t from-coral-100 to-transparent blur-3xl opacity-40" />
      </div>

      <div className="z-10 mx-auto flex w-full max-w-2xl flex-col items-center gap-14 text-center">
        <div className="space-y-6">
          <h1 className="text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl md:text-7xl animate-fade-up [animation-delay:100ms]">
            Sunke<span className="text-rose-500">Lo</span>
          </h1>
          <p className="mx-auto max-w-md text-lg text-gray-500 sm:text-xl leading-relaxed animate-fade-up [animation-delay:200ms]">
            Ask about any product.
            <br className="hidden sm:block" />
            <span className="text-gray-700">Get a spoken verdict in your language.</span>
          </p>
        </div>

        <div className="w-full animate-fade-up [animation-delay:400ms]">
          <VoiceInput onTranscript={() => {}} />
        </div>
      </div>
    </main>
  );
}
