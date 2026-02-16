"use client";

import { useMemo, useRef, useState } from "react";

import { useSSEQuery } from "@/hooks/use-sse-query";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LanguageBadge } from "@/components/language-badge";
import { ProgressSteps } from "@/components/progress-steps";

type VoiceInputProps = {
  onTranscript: (value: string) => void;
};

type SSEStatusData = {
  status?: string;
  context?: {
    transcript?: string;
    language?: string;
    product?: string;
  };
};

type SSEErrorData = {
  code?: string;
  message?: string;
};

type SSEDoneData = {
  sourceCount?: number;
};

const EXAMPLE_PRODUCT_QUERIES = [
  "Redmi Note 15 kaisa hai?",
  "MacBook Air M3 review",
  "Sony WH-1000XM5 worth buying?",
];

function getNotAProductMessage(languageCode: string | null): string {
  if (!languageCode) {
    return "Ask about any product review/comparison. Try one of these queries.";
  }

  if (languageCode.startsWith("hi")) {
    return "Main kisi bhi product review/comparison mein madad kar sakta hoon. Inmein se koi query try karo.";
  }
  if (languageCode.startsWith("od")) {
    return "Mu je kaunsi product review/comparison re sahajya kari paribi. Ehi query mane try karantu.";
  }
  if (languageCode.startsWith("bn")) {
    return "Ami jekono product review/comparison niye help korte pari. Nicher query gulo try korun.";
  }

  return "Ask about any product review/comparison. Try one of these queries.";
}

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const recorder = useVoiceRecorder();
  const query = useSSEQuery();
  const [textInput, setTextInput] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("Tap to record");
  const [progressStep, setProgressStep] = useState<
    "idle" | "listening" | "understood" | "searching" | "analyzing" | "done" | "error"
  >("idle");
  const [understoodProduct, setUnderstoodProduct] = useState<string | null>(null);
  const [notProductError, setNotProductError] = useState<string | null>(null);
  const detectedLanguageRef = useRef<string | null>(null);

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
      if (statusData.status === "listening") {
        setNotProductError(null);
        setProgressStep("listening");
        setStatusText("Listening...");
      }
      if (statusData.status === "understood") {
        const transcript = String(statusData.context?.transcript ?? "");
        const languageCode = String(statusData.context?.language ?? "");
        setProgressStep("understood");
        setStatusText(`Got it: ${transcript}`);
        if (languageCode) {
          detectedLanguageRef.current = languageCode;
          setDetectedLanguage(languageCode);
        }
        onTranscript(transcript);
      }
      if (statusData.status === "searching") {
        const product = statusData.context?.product ?? "";
        setProgressStep("searching");
        setUnderstoodProduct(product || null);
        setStatusText(`Searching: ${product || "phone reviews"}`);
      }
      if (statusData.status === "analyzing") {
        setProgressStep("analyzing");
      }
    }

    if (event.type === "error") {
      const errorData = event.data as SSEErrorData;
      setProgressStep("error");
      if (errorData.code === "NOT_A_PRODUCT") {
        setNotProductError(getNotAProductMessage(detectedLanguageRef.current));
      }
    }

    if (event.type === "done") {
      const doneData = event.data as SSEDoneData;
      setProgressStep("done");
      if (typeof doneData.sourceCount === "number") {
        setStatusText(`Done: analyzed ${doneData.sourceCount} sources`);
      } else {
        setStatusText("Done");
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
    setNotProductError(null);
    setUnderstoodProduct(null);
    setProgressStep("idle");
    detectedLanguageRef.current = null;
    await query.sendQuery({ text: textInput.trim() }, handleEvent);
  };

  const submitTextValue = async (value: string) => {
    const next = value.trim();
    if (!next) return;
    setTextInput(next);
    setNotProductError(null);
    setUnderstoodProduct(null);
    setProgressStep("idle");
    detectedLanguageRef.current = null;
    await query.sendQuery({ text: next }, handleEvent);
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
            setNotProductError(null);
            setUnderstoodProduct(null);
            setProgressStep("idle");
            detectedLanguageRef.current = null;
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
          placeholder="Type product query (fallback)"
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

      <ProgressSteps currentStep={progressStep} understoodProduct={understoodProduct} />

      {notProductError ? (
        <div className="space-y-3 rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
          <p className="text-sm text-amber-200">{notProductError}</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PRODUCT_QUERIES.map((queryText) => (
              <button
                key={queryText}
                type="button"
                className="rounded-full border border-amber-600/60 px-3 py-1 text-xs text-amber-100 hover:bg-amber-900/40"
                onClick={() => {
                  void submitTextValue(queryText);
                }}
              >
                {queryText}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {query.error ? <p className="text-sm text-red-400">{query.error}</p> : null}
    </div>
  );
}
