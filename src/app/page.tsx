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
          <div className="flex items-center justify-center gap-2 animate-fade-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-coral-500 shadow-lg">
              <svg
                className="h-6 w-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
          </div>

          <h1 className="text-5xl font-semibold tracking-tight text-gray-900 sm:text-6xl md:text-7xl animate-fade-up [animation-delay:100ms]">
            Sunke<span className="text-rose-500">Lo</span>
          </h1>
          <p className="mx-auto max-w-md text-lg text-gray-500 sm:text-xl leading-relaxed animate-fade-up [animation-delay:200ms]">
            Ask about any product.
            <br className="hidden sm:block" />
            <span className="text-gray-700">Get a spoken verdict in your language.</span>
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2 animate-fade-up [animation-delay:300ms]">
            {[
              "Hindi",
              "Kannada",
              "Bengali",
              "Tamil",
              "Telugu",
              "English",
              "Marathi",
              "Gujarati",
            ].map((lang) => (
              <span
                key={lang}
                className="px-4 py-2 rounded-full text-xs font-medium tracking-wide text-gray-500 bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-rose-200 hover:text-rose-600 transition-all duration-300 cursor-default"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full animate-fade-up [animation-delay:400ms]">
          <VoiceInput onTranscript={() => {}} />
        </div>
      </div>

      <footer className="absolute bottom-8 text-xs text-gray-400 font-medium tracking-wide">
        Made with warmth for everyone
      </footer>
    </main>
  );
}
