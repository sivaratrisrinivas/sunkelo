"use client";

import { useMemo, useRef, useState } from "react";
import { useSSEQuery } from "@/hooks/use-sse-query";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LanguageBadge } from "@/components/language-badge";
import { ProgressSteps } from "@/components/progress-steps";
import { ReviewCard, type ReviewCardData } from "@/components/review-card";
import { AudioPlayer } from "@/components/audio-player";

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
  suggestions?: string[];
};

type SSEDoneData = {
  sourceCount?: number;
};

type SSEReviewData = ReviewCardData;

type SSEAudioData = {
  audioUrl?: string;
  durationSeconds?: number;
};

const EXAMPLE_PRODUCT_QUERIES = [
  "Redmi Note 15 kaisa hai?",
  "MacBook Air M3 review",
  "Sony WH-1000XM5 worth buying?",
];

function getNotAProductMessage(languageCode: string | null): string {
  if (!languageCode) {
    return "I can help with any product review. Try one of these:";
  }
  if (languageCode.startsWith("hi")) {
    return "Main kisi bhi product review mein madad kar sakta hoon. Ye try karo:";
  }
  if (languageCode.startsWith("od")) {
    return "Mu je kaunsi product re sahajya kari paribi. Ehi try karantu:";
  }
  if (languageCode.startsWith("bn")) {
    return "Ami jekono product review niye help korte pari. Nicher query gulo try korun:";
  }
  return "I can help with any product review. Try one of these:";
}

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const recorder = useVoiceRecorder();
  const query = useSSEQuery();
  const [textInput, setTextInput] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("Tap the mic and ask away");
  const [progressStep, setProgressStep] = useState<
    "idle" | "listening" | "understood" | "searching" | "analyzing" | "done" | "error"
  >("idle");
  const [understoodProduct, setUnderstoodProduct] = useState<string | null>(null);
  const [notProductError, setNotProductError] = useState<string | null>(null);
  const [noReviewsError, setNoReviewsError] = useState<{
    message: string;
    suggestions: string[];
  } | null>(null);
  const [reviewData, setReviewData] = useState<ReviewCardData | null>(null);
  const [audioData, setAudioData] = useState<SSEAudioData | null>(null);
  const detectedLanguageRef = useRef<string | null>(null);

  const isRecording = recorder.state === "recording";
  const isProcessing = recorder.state === "processing" || query.state === "streaming";

  const buttonLabel = useMemo(() => {
    if (isRecording) return "Recording...";
    if (isProcessing) return "Processing...";
    return "Tap to ask";
  }, [isProcessing, isRecording]);

  const handleEvent = (event: { type: string; data: unknown }) => {
    if (event.type === "status") {
      const statusData = event.data as SSEStatusData;
      if (statusData.status === "listening") {
        setNotProductError(null);
        setNoReviewsError(null);
        setReviewData(null);
        setAudioData(null);
        setProgressStep("listening");
        setStatusText("Listening to you...");
      }
      if (statusData.status === "understood") {
        const transcript = String(statusData.context?.transcript ?? "");
        const languageCode = String(statusData.context?.language ?? "");
        setProgressStep("understood");
        setStatusText(`Got it: "${transcript}"`);
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
        setStatusText(`Finding reviews for ${product || "this product"}...`);
      }
      if (statusData.status === "analyzing") {
        setProgressStep("analyzing");
        setStatusText("Analyzing reviews for you...");
      }
    }

    if (event.type === "review") {
      const review = event.data as SSEReviewData;
      setReviewData(review);
      setNoReviewsError(null);
      setNotProductError(null);
      setAudioData(null);
    }

    if (event.type === "audio") {
      const audio = event.data as SSEAudioData;
      if (audio.audioUrl) {
        setAudioData(audio);
      }
    }

    if (event.type === "error") {
      const errorData = event.data as SSEErrorData;
      setProgressStep("error");
      if (errorData.code === "NOT_A_PRODUCT") {
        setNoReviewsError(null);
        setReviewData(null);
        setAudioData(null);
        setNotProductError(getNotAProductMessage(detectedLanguageRef.current));
      }
      if (errorData.code === "NO_REVIEWS") {
        setNotProductError(null);
        setReviewData(null);
        setAudioData(null);
        setNoReviewsError({
          message: errorData.message ?? "Couldn't find enough reviews for this product.",
          suggestions: errorData.suggestions ?? EXAMPLE_PRODUCT_QUERIES,
        });
      }
      if (errorData.code === "INSUFFICIENT_USER_REVIEW_EVIDENCE") {
        setNotProductError(null);
        setReviewData(null);
        setAudioData(null);
        setNoReviewsError({
          message: errorData.message ?? "Not enough verified reviews found.",
          suggestions: errorData.suggestions ?? EXAMPLE_PRODUCT_QUERIES,
        });
      }
    }

    if (event.type === "done") {
      const doneData = event.data as SSEDoneData;
      setProgressStep("done");
      if (typeof doneData.sourceCount === "number") {
        setStatusText(`All done! Analyzed ${doneData.sourceCount} sources`);
      } else {
        setStatusText("All done!");
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
    setNoReviewsError(null);
    setUnderstoodProduct(null);
    setReviewData(null);
    setAudioData(null);
    setProgressStep("idle");
    detectedLanguageRef.current = null;
    await query.sendQuery({ text: textInput.trim() }, handleEvent);
  };

  const submitTextValue = async (value: string) => {
    const next = value.trim();
    if (!next) return;
    setTextInput(next);
    setNotProductError(null);
    setNoReviewsError(null);
    setUnderstoodProduct(null);
    setReviewData(null);
    setAudioData(null);
    setProgressStep("idle");
    detectedLanguageRef.current = null;
    await query.sendQuery({ text: next }, handleEvent);
  };

  return (
    <div className="w-full max-w-xl space-y-10">
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          <div
            className={`absolute inset-0 -z-10 rounded-full transition-all duration-700 ${
              isRecording
                ? "bg-rose-400/20 scale-150 blur-2xl animate-pulse"
                : isProcessing
                  ? "bg-rose-300/10 scale-125 blur-xl"
                  : "bg-transparent scale-100 blur-none"
            }`}
          />

          {isRecording && (
            <>
              <div className="absolute inset-0 -z-10 rounded-full animate-recording bg-rose-400/30" />
              <div className="absolute inset-0 -z-10 rounded-full animate-ripple bg-rose-400/20" />
            </>
          )}

          <button
            type="button"
            aria-label={buttonLabel}
            className={`group relative flex h-28 w-28 items-center justify-center rounded-full shadow-lg transition-all duration-500 focus:outline-none focus:ring-4 focus:ring-rose-500/20 ${
              isRecording
                ? "bg-gradient-to-br from-rose-400 to-rose-500 shadow-rose-500/30"
                : isProcessing
                  ? "bg-gray-100 cursor-wait"
                  : "bg-white border-2 border-gray-100 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-500/10 active:scale-95"
            }`}
            onClick={async () => {
              if (isRecording) {
                recorder.stop();
                return;
              }
              setNotProductError(null);
              setNoReviewsError(null);
              setUnderstoodProduct(null);
              setReviewData(null);
              setAudioData(null);
              setProgressStep("idle");
              detectedLanguageRef.current = null;
              await recorder.start();
            }}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <div className="h-3 w-3 rounded-full bg-rose-400 animate-bounce" />
            ) : isRecording ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="white"
                className="animate-wiggle"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ff385c"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-300 group-hover:scale-110"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p
            className={`text-base font-medium transition-colors duration-300 ${
              isRecording ? "text-rose-500" : "text-gray-500"
            }`}
          >
            {statusText}
          </p>
          {detectedLanguage ? (
            <div className="animate-scale-in">
              <LanguageBadge languageCode={detectedLanguage} />
            </div>
          ) : null}
        </div>
      </div>

      {recorder.error ? (
        <div className="animate-scale-in rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
          <span className="font-medium">Microphone access needed</span>
          <p className="mt-1 text-red-500">{recorder.error}</p>
        </div>
      ) : null}

      <div className="relative mx-auto max-w-md">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm transition-all focus-within:shadow-md focus-within:border-rose-200">
          <div className="flex-1">
            <input
              value={textInput}
              onChange={(event) => setTextInput(event.target.value)}
              placeholder="Or type your question..."
              className="w-full bg-transparent px-4 py-2.5 text-gray-700 placeholder-gray-400 outline-none text-sm"
              onKeyDown={(e) => e.key === "Enter" && submitText()}
            />
          </div>
          <button
            type="button"
            className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-rose-600 hover:shadow-lg disabled:opacity-50 disabled:shadow-none"
            onClick={submitText}
            disabled={isProcessing || !textInput.trim()}
          >
            Ask
          </button>
        </div>
      </div>

      {recorder.blob ? (
        <div className="animate-scale-in flex justify-center">
          <button
            type="button"
            className="rounded-full border border-gray-200 bg-white px-8 py-3 text-sm font-medium text-gray-600 shadow-md transition-all hover:border-rose-200 hover:text-rose-500 hover:shadow-lg"
            onClick={async () => {
              await submitAudio(recorder.blob as Blob);
              recorder.reset();
            }}
            disabled={isProcessing}
          >
            Send recording
          </button>
        </div>
      ) : null}

      <div className="pt-2">
        <ProgressSteps currentStep={progressStep} understoodProduct={understoodProduct} />
      </div>

      {notProductError ? (
        <div className="animate-scale-in space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-center text-sm text-amber-800">{notProductError}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_PRODUCT_QUERIES.map((queryText) => (
              <button
                key={queryText}
                type="button"
                className="rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-medium text-amber-700 transition-all hover:border-amber-300 hover:bg-amber-100"
                onClick={() => void submitTextValue(queryText)}
              >
                {queryText}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {noReviewsError ? (
        <div className="animate-scale-in space-y-4 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-center text-sm text-orange-800">{noReviewsError.message}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {noReviewsError.suggestions.map((queryText) => (
              <button
                key={queryText}
                type="button"
                className="rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-medium text-orange-700 transition-all hover:border-orange-300 hover:bg-orange-100"
                onClick={() => void submitTextValue(`${queryText} review`)}
              >
                {queryText}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {progressStep === "analyzing" && !reviewData ? (
        <div className="animate-scale-in">
          <ReviewCard loading />
        </div>
      ) : null}

      {reviewData ? (
        <div className="animate-scale-in">
          <ReviewCard data={reviewData} />
        </div>
      ) : null}

      {audioData?.audioUrl ? (
        <div className="animate-scale-in pt-6">
          <AudioPlayer audioUrl={audioData.audioUrl} durationSeconds={audioData.durationSeconds} />
        </div>
      ) : null}

      {query.error ? <p className="text-center text-sm text-red-500">{query.error}</p> : null}
    </div>
  );
}
