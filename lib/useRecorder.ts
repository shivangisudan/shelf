"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecorderState } from "./types";

export const MAX_MS = 60_000;
export const WARN_AT_MS = 50_000;
/** Shorter than this was a stray tap, not speech. */
const MIN_MS = 400;

/** First container the browser admits to supporting; Android Chrome gives webm/opus. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

const DENIED_MESSAGE =
  "Microphone access is needed to record. Enable it in your browser settings.";

function describe(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return DENIED_MESSAGE;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone found. Connect one and try again.";
  }
  return "Could not start recording. Check the microphone and try again.";
}

export function useRecorder(onComplete: (blob: Blob) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blobSize, setBlobSize] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop builds the blob and releases the stream
    } else {
      clearTick();
      releaseStream();
    }
  }, [clearTick, releaseStream]);

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    setMessage(null);
    setState("requesting");

    if (!navigator.mediaDevices?.getUserMedia) {
      // Typically a page served over plain http from a LAN address.
      setMessage("Recording needs a secure (https) connection.");
      setState("denied");
      return;
    }

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setMessage(describe(error));
      setState("denied");
      return;
    }

    streamRef.current = media;
    setStream(media);

    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const duration = Date.now() - startedAtRef.current;
      clearTick();
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      setBlobSize(blob.size);
      releaseStream();

      if (duration < MIN_MS || blob.size < 1024) {
        setMessage(
          blob.size < 1024
            ? "Nothing was recorded. Check microphone access and try again."
            // Tap to start, tap to stop — there is no press-and-hold here.
            : "That was too short. Tap to record, speak, then tap again.",
        );
        setState("idle");
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPreviewUrl(urlRef.current);
      setState("recorded");
      completeRef.current(blob);
    };

    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start(250);
    setState("recording");

    clearTick();
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= MAX_MS) stopRef.current();
    }, 200);
  }, [clearTick, releaseStream]);

  const reset = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreviewUrl(null);
    setBlobSize(0);
    setElapsed(0);
    setMessage(null);
    setState("idle");
  }, []);

  // Unmount: kill the timer, the recorder, the tracks and the object URL.
  useEffect(
    () => () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return { state, stream, elapsed, blobSize, previewUrl, message, start, stop, reset };
}
