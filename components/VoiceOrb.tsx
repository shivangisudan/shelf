"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { VoiceState } from "@/lib/types";

type VoiceOrbProps = {
  stream: MediaStream | null;
  state: VoiceState;
};

const RING_COUNT = 3;
/** Speech RMS sits well under 1, so lift it into a usable 0..1 range. */
const GAIN = 5.5;
/** Amplitude that counts as a peak worth sending a ring out on. */
const PEAK_LEVEL = 0.42;
/** Refractory gap, so one loud sentence doesn't stack rings on every frame. */
const PEAK_COOLDOWN_MS = 220;

const LABEL: Record<VoiceState, string> = {
  idle: "Microphone ready",
  recording: "Recording your voice",
  processing: "Working out the details",
};

export default function VoiceOrb({ stream, state }: VoiceOrbProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringsRef = useRef<(HTMLDivElement | null)[]>([]);
  const nextRing = useRef(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || state !== "recording" || !stream) return;
    // Reduced motion means no pulsing at all, so there is nothing to measure.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const audio = new AudioContext();
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    // Browsers hand back a suspended context when there was no user gesture.
    void audio.resume();

    const samples = new Uint8Array(analyser.fftSize);
    let smoothed = 0;
    let lastPeak = 0;
    let frame = 0;

    const ping = () => {
      const ring = ringsRef.current[nextRing.current % RING_COUNT];
      nextRing.current += 1;
      if (!ring) return;
      ring.classList.remove("is-pinging");
      void ring.offsetWidth; // Force reflow so the animation restarts.
      ring.classList.add("is-pinging");
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      analyser.getByteTimeDomainData(samples);

      // RMS around the 128 midpoint — loudness, not pitch.
      let sum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const deviation = (samples[i] - 128) / 128;
        sum += deviation * deviation;
      }
      // Soft saturation rather than a hard clamp: a merchant in a loud market
      // would otherwise sit pinned at maximum, and a pinned orb stops reading
      // as responsive. This curve approaches 1 without ever reaching it, so
      // there is always headroom left to react with.
      const rms = Math.sqrt(sum / samples.length);
      const level = 1 - Math.exp(-rms * GAIN);

      // Fast attack, slow release: leap on a syllable, ease back down.
      smoothed += (level - smoothed) * (level > smoothed ? 0.5 : 0.12);
      root.style.setProperty("--amp", smoothed.toFixed(3));

      const now = performance.now();
      if (smoothed > PEAK_LEVEL && now - lastPeak > PEAK_COOLDOWN_MS) {
        lastPeak = now;
        ping();
      }
    };
    frame = requestAnimationFrame(tick);

    // Runs on unmount and whenever state or stream leaves this branch.
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void audio.close();
      root.style.setProperty("--amp", "0");
    };
  }, [stream, state]);

  return (
    <div
      ref={rootRef}
      className={`voice-orb is-${state}`}
      role="img"
      aria-label={LABEL[state]}
    >
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            ringsRef.current[i] = el;
          }}
          className="voice-orb__ring"
        />
      ))}
      <div className="voice-orb__dim">
        <div className="voice-orb__scaler">
          <div className="voice-orb__glow" />
          <div className="voice-orb__asset">
            <Image src="/blob.gif" alt="" fill unoptimized sizes="148px" />
          </div>
        </div>
      </div>
    </div>
  );
}
