"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSSEQuery } from "@/hooks/use-sse-query";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LanguageBadge } from "@/components/language-badge";
import { ProgressSteps } from "@/components/progress-steps";
import { ReviewCard, type ReviewCardData } from "@/components/review-card";
import { AudioPlayer } from "@/components/audio-player";
import { QuotaBadge } from "@/components/quota-badge";

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
  remaining?: number;
  cached?: boolean;
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
  const autoSubmittedRef = useRef(false);
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);

  const isRecording = recorder.state === "recording";
  const isProcessing = recorder.state === "processing" || query.state === "streaming";

  const buttonLabel = useMemo(() => {
    if (isRecording) return "Recording...";
    if (isProcessing) return "Processing...";
    return "Tap to ask";
  }, [isProcessing, isRecording]);

  // Auto-submit when recording stops and blob is ready
  useEffect(() => {
    if (recorder.blob && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      const form = new FormData();
      form.append("audio", recorder.blob, "query.webm");
      void query.sendQuery(form, handleEvent);
      recorder.reset();
    }
    if (!recorder.blob) {
      autoSubmittedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.blob]);

  const handleEvent = (event: { type: string; data: unknown }) => {
    if (event.type === "status") {
      const statusData = event.data as SSEStatusData;
      if (statusData.status === "listening") {
        setNotProductError(null);
        setNoReviewsError(null);
        setReviewData(null);
        setAudioData(null);
        setProgressStep("listening");
        setStatusText("Listening...");
      }
      if (statusData.status === "understood") {
        const transcript = String(statusData.context?.transcript ?? "");
        const languageCode = String(statusData.context?.language ?? "");
        setProgressStep("understood");
        setStatusText(`"${transcript}"`);
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
        setStatusText("Analyzing reviews...");
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
      if (typeof doneData.remaining === "number") {
        setQuotaRemaining(doneData.remaining);
      }
      if (doneData.cached) {
        setStatusText("Done · from cache");
      } else if (typeof doneData.sourceCount === "number") {
        setStatusText(`Done · ${doneData.sourceCount} sources`);
      } else {
        setStatusText("Done");
      }
    }
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
    <div className="w-full space-y-10">
      {/* Mic button */}
      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          aria-label={buttonLabel}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500 focus:outline-none ${isRecording
            ? "bg-[var(--accent)] animate-recording"
            : isProcessing
              ? "bg-[var(--bg-surface)] cursor-wait"
              : "bg-[var(--bg-surface)] border border-[var(--glass-border)] hover:border-[var(--accent)]/30 hover:shadow-[0_0_30px_var(--accent-glow)] active:scale-95"
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
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
          ) : isRecording ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </button>

        <div className="flex flex-col items-center gap-2">
          <p
            className={`text-sm tracking-wide transition-colors duration-300 ${isRecording ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"
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

      {/* Mic error */}
      {recorder.error ? (
        <div className="animate-scale-in rounded-xl border border-[var(--color-skip)]/20 bg-[var(--color-skip-muted)] p-4 text-center text-sm text-[var(--color-skip)]">
          {recorder.error}
        </div>
      ) : null}

      {/* Text input */}
      <div className="mx-auto max-w-md">
        <div className="flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--bg-surface)] p-1.5 transition-all focus-within:border-[var(--accent)]/30">
          <input
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder="Or type your question..."
            className="flex-1 bg-transparent px-4 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)]"
            onKeyDown={(e) => e.key === "Enter" && submitText()}
          />
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-all hover:brightness-110 disabled:opacity-30"
            onClick={submitText}
            disabled={isProcessing || !textInput.trim()}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress */}
      <ProgressSteps currentStep={progressStep} understoodProduct={understoodProduct} />

      {/* Not a product error */}
      {notProductError ? (
        <div className="animate-scale-in space-y-4 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-5 text-center">
          <p className="text-sm text-[var(--fg-muted)]">{notProductError}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_PRODUCT_QUERIES.map((queryText) => (
              <button
                key={queryText}
                type="button"
                className="rounded-full border border-[var(--glass-border)] px-4 py-1.5 text-xs text-[var(--accent-soft)] transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5"
                onClick={() => void submitTextValue(queryText)}
              >
                {queryText}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* No reviews error */}
      {noReviewsError ? (
        <div className="animate-scale-in space-y-4 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-5 text-center">
          <p className="text-sm text-[var(--fg-muted)]">{noReviewsError.message}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {noReviewsError.suggestions.map((queryText) => (
              <button
                key={queryText}
                type="button"
                className="rounded-full border border-[var(--glass-border)] px-4 py-1.5 text-xs text-[var(--accent-soft)] transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5"
                onClick={() => void submitTextValue(`${queryText} review`)}
              >
                {queryText}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Review skeleton */}
      {progressStep === "analyzing" && !reviewData ? (
        <div className="animate-scale-in">
          <ReviewCard loading />
        </div>
      ) : null}

      {/* Review card */}
      {reviewData ? (
        <div className="animate-scale-in">
          <ReviewCard data={reviewData} />
        </div>
      ) : null}

      {/* Audio player */}
      {audioData?.audioUrl ? (
        <div className="animate-scale-in">
          <AudioPlayer audioUrl={audioData.audioUrl} durationSeconds={audioData.durationSeconds} />
        </div>
      ) : null}

      {/* Quota badge */}
      {typeof quotaRemaining === "number" ? (
        <div className="flex justify-center animate-scale-in">
          <QuotaBadge remaining={quotaRemaining} total={5} />
        </div>
      ) : null}

      {query.error ? <p className="text-center text-sm text-[var(--color-skip)]">{query.error}</p> : null}
    </div>
  );
}
