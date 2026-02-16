"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_AUDIO_DURATION_SECONDS, MAX_AUDIO_UPLOAD_BYTES } from "@/lib/utils/constants";

type RecorderState = "idle" | "recording" | "processing" | "error";

type RecorderResult = {
  state: RecorderState;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  blob: Blob | null;
};

const SILENCE_THRESHOLD = 0.015;
const SILENCE_AUTO_STOP_MS = 5000;

export function useVoiceRecorder(): RecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const hardStopTimerRef = useRef<number | null>(null);
  const analyserIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceSinceRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (hardStopTimerRef.current) {
      window.clearTimeout(hardStopTimerRef.current);
      hardStopTimerRef.current = null;
    }
    if (analyserIntervalRef.current) {
      window.clearInterval(analyserIntervalRef.current);
      analyserIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      setState("processing");
      mediaRecorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setBlob(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setState("error");
        setError("Failed to record audio");
      };

      recorder.onstop = () => {
        const output = new Blob(chunksRef.current, { type: "audio/webm" });
        if (output.size > MAX_AUDIO_UPLOAD_BYTES) {
          setState("error");
          setError("Audio file exceeds 10MB limit");
        } else {
          setBlob(output);
          setState("idle");
        }
        cleanup();
      };

      recorder.start();
      setState("recording");

      hardStopTimerRef.current = window.setTimeout(
        stop,
        MAX_AUDIO_DURATION_SECONDS * 1000,
      );

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      analyserIntervalRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / data.length);
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceSinceRef.current) {
            silenceSinceRef.current = Date.now();
          }
          if (Date.now() - silenceSinceRef.current >= SILENCE_AUTO_STOP_MS) {
            stop();
          }
        } else {
          silenceSinceRef.current = null;
        }
      }, 250);
    } catch (startError) {
      setState("error");
      setError(startError instanceof Error ? startError.message : "Microphone access denied");
      cleanup();
    }
  }, [cleanup, stop]);

  const reset = useCallback(() => {
    cleanup();
    setBlob(null);
    setError(null);
    setState("idle");
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { state, error, start, stop, reset, blob };
}
