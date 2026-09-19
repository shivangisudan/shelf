"use client";

import { useEffect, useRef } from "react";

type LiveWaveformProps = { stream: MediaStream | null; active: boolean };

export default function LiveWaveform({ stream, active }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream || !active) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const audio = new AudioContext();
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    void audio.resume();

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const width = canvas.clientWidth * window.devicePixelRatio;
      const height = canvas.clientHeight * window.devicePixelRatio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      analyser.getByteFrequencyData(data);
      context.clearRect(0, 0, width, height);
      const bars = 28;
      const gap = 3 * window.devicePixelRatio;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      for (let index = 0; index < bars; index += 1) {
        const value = data[Math.floor((index / bars) * data.length)] / 255;
        const barHeight = Math.max(2, value * height * 0.9);
        context.fillStyle = "#D9443F";
        context.beginPath();
        context.roundRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
        context.fill();
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void audio.close();
    };
  }, [active, stream]);

  return <canvas ref={canvasRef} className="waveform-canvas" aria-label="Live microphone waveform" role="img" />;
}
