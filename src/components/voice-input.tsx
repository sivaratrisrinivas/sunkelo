"use client";

import { useMemo, useState } from "react";

import { useSSEQuery } from "@/hooks/use-sse-query";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LanguageBadge } from "@/components/language-badge";

type VoiceInputProps = {
  onTranscript: (value: string) => void;
};

type SSEStatusData = {
  status?: string;
  context?: {
    transcript?: string;
    language?: string;
  };
};

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const recorder = useVoiceRecorder();
  const query = useSSEQuery();
  const [textInput, setTextInput] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("Tap to record");

  const isRecording = recorder.state === "recording";
  const isProcessing = recorder.state === "processing" || query.state === "streaming";

  const buttonLabel = useMemo(() => {
    if (isRecording) return "Recording... tap to stop";
    if (isProcessing) return "Processing...";
    return "Tap to record";
  }, [isProcessing, isRecording]);

  const handleEvent = (event: { type: string; data: unknown }) => {
    if (event.type === "status") {
      const statusData = event.data as SSEStatusData;
      if (statusData.status === "listening") setStatusText("Listening...");
      if (statusData.status === "understood") {
        const transcript = String(statusData.context?.transcript ?? "");
        const languageCode = String(statusData.context?.language ?? "");
        setStatusText(`Got it: ${transcript}`);
        if (languageCode) {
          setDetectedLanguage(languageCode);
        }
        onTranscript(transcript);
      }
    }
  };

  const submitAudio = async (audioBlob: Blob) => {
    const form = new FormData();
    form.append("audio", audioBlob, "query.webm");
    await query.sendQuery(form, handleEvent);
  };

  const submitText = async () => {
    if (!textInput.trim()) return;
    await query.sendQuery({ text: textInput.trim() }, handleEvent);
  };

  return (
    <div className="w-full max-w-xl space-y-4">
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          aria-label={buttonLabel}
          className={`flex h-20 w-20 items-center justify-center rounded-full border text-4xl transition ${
            isRecording ? "animate-pulse border-green-500 bg-green-950" : "border-zinc-500 bg-zinc-900"
          }`}
          onClick={async () => {
            if (isRecording) {
              recorder.stop();
              return;
            }
            await recorder.start();
          }}
          disabled={isProcessing}
        >
          🎤
        </button>
        <p className="text-sm text-zinc-300">{statusText}</p>
        {detectedLanguage ? <LanguageBadge languageCode={detectedLanguage} /> : null}
      </div>

      {recorder.error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
          Mic access required: {recorder.error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          value={textInput}
          onChange={(event) => setTextInput(event.target.value)}
          placeholder="Type product name (fallback)"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <button
          type="button"
          className="rounded-md border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-900"
          onClick={submitText}
          disabled={isProcessing || !textInput.trim()}
        >
          Ask
        </button>
      </div>

      {recorder.blob ? (
        <button
          type="button"
          className="w-full rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
          onClick={async () => {
            await submitAudio(recorder.blob as Blob);
            recorder.reset();
          }}
          disabled={isProcessing}
        >
          Send recorded audio
        </button>
      ) : null}

      {query.error ? <p className="text-sm text-red-400">{query.error}</p> : null}
    </div>
  );
}
