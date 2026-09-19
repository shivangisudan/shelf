"use client";

import { useEffect } from "react";
import { Mic, Square, TriangleAlert } from "lucide-react";
import LiveWaveform from "./LiveWaveform";
import { MAX_MS, WARN_AT_MS, useRecorder } from "@/lib/useRecorder";

type VoiceRecorderProps = {
  onComplete: (blob: Blob) => void;
  disabled?: boolean;
  onStatusChange?: (status: "idle" | "listening") => void;
};

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function VoiceRecorder({ onComplete, disabled = false, onStatusChange }: VoiceRecorderProps) {
  const { state, stream, elapsed, message, start, stop } =
    useRecorder(onComplete);

  const listening = state === "recording";
  const busy = disabled || state === "requesting";
  const remaining = Math.max(0, Math.ceil((MAX_MS - elapsed) / 1000));

  useEffect(() => {
    onStatusChange?.(listening ? "listening" : "idle");
  }, [listening, onStatusChange]);

  const toggleRecording = () => {
    if (busy) return;
    if (listening) stop();
    else void start();
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {listening && <span className="record-ring" aria-hidden="true" />}
        <button type="button" disabled={disabled || state === "requesting"} onClick={toggleRecording} className={`record-button touch-control relative flex items-center justify-center text-white ${listening ? "is-listening" : ""}`} aria-label={listening ? "Stop recording" : "Start recording"} aria-pressed={listening}>
          {listening ? <Square size={28} fill="currentColor" aria-hidden /> : <Mic size={30} aria-hidden />}
        </button>
      </div>

      {listening ? <div className="mt-4 flex flex-col items-center gap-2"><LiveWaveform stream={stream} active={listening} /><span className="text-sm tabular-nums text-secondary" aria-live="off">{formatClock(elapsed)}</span></div> : state === "requesting" || busy ? <p className="mt-4 text-sm text-secondary" role="status">Starting microphone…</p> : state === "recorded" ? <p className="mt-4 text-sm text-secondary" role="status">Voice note ready</p> : <p className="mt-4 text-[15px] text-secondary">Tap to speak</p>}

      {elapsed >= WARN_AT_MS && listening && <p className="mt-2 text-xs text-accent" role="status">Recording stops in {remaining}s</p>}

      {/* A take too short or too quiet to use. Without this the button just
          silently returns to "Tap to speak" and nothing explains why. */}
      {state !== "denied" && message && <p className="mt-2 text-sm text-error" role="status">{message}</p>}

      {state === "denied" && (
        <div
          role="alert"
          className="flex w-full max-w-xs items-start gap-3 rounded-md bg-error-bg p-4"
        >
          <TriangleAlert className="mt-1 shrink-0 text-error" size={20} aria-hidden />
          <p className="text-error">Shelf needs mic access to hear you. {message}</p>
        </div>
      )}

    </div>
  );
}
