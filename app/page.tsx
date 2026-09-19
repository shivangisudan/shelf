"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Camera, ChevronDown, ImagePlus, Pencil } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import VoiceRecorder from "@/components/VoiceRecorder";
import type { Category } from "@/lib/taxonomy";
import { countProducts, saveReviewedProduct } from "@/lib/db";
import { motion } from "motion/react";

type Mode = "speak" | "photo";
type ScreenStatus = "idle" | "listening" | "processing" | "done";
type SaveState = "idle" | "saving" | "saved";
type Product = {
  name: string;
  name_original: string;
  category: Category;
  description: string;
  price: number | null;
  quantity_unit: string | null;
  stock_quantity: number | null;
  stock_unit: string | null;
  confidence: "high" | "medium" | "low";
};
type Result = { products: Product[]; language_detected: string };

function audioName(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes("mp4")) return "recording.m4a";
  if (type.includes("mpeg")) return "recording.mp3";
  if (type.includes("ogg")) return "recording.ogg";
  return "recording.webm";
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("speak");
  const [capture, setCapture] = useState<Blob | File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [recorderKey, setRecorderKey] = useState(0);
  const [language, setLanguage] = useState("हिन्दी");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [status, setStatus] = useState<ScreenStatus>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** null while loading, or when the count could not be read — better a missing badge than a wrong one. */
  const [catalogCount, setCatalogCount] = useState<number | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    void refreshCatalogCount();
  }, []);

  // Let the merchant see "Added" land before the screen changes under them.
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => router.push("/catalog"), 900);
    return () => window.clearTimeout(timer);
  }, [saveState, router]);

  async function refreshCatalogCount() {
    const count = await countProducts();
    setCatalogCount(count.ok ? count.data : null);
  }

  function clearCapture() {
    if (preview) URL.revokeObjectURL(preview);
    setCapture(null);
    setPreview(null);
    setError(null);
    setResult(null);
    setRecorderKey((key) => key + 1);
    setStatus("idle");
    setSaveState("idle");
  }

  function chooseMode(nextMode: Mode) {
    if (nextMode === mode || processing) return;
    setMode(nextMode);
    clearCapture();
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setCapture(file);
    setError(null);
    void extract(file);
  }

  /** Every capture — audio, photo and example chip — goes through one request path. */
  async function runExtraction(addInput: (formData: FormData) => void) {
    if (processing) return;
    setProcessing(true);
    setStatus("processing");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("language", language);
      addInput(formData);
      const response = await fetch("/api/extract", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Could not extract product details.");
      setResult(payload as Result);
      setSaveState("idle");
      setStatus("done");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not extract product details.";
      setError(message === "Failed to fetch" ? "Could not reach the extraction service. Make sure the app server is running and try again." : message);
      setStatus("idle");
    } finally {
      setProcessing(false);
    }
  }

  async function extract(captureOverride: Blob | File | null = capture) {
    if (!captureOverride) return;
    await runExtraction((formData) => {
      if (mode === "speak") formData.append("audio", captureOverride, audioName(captureOverride));
      else formData.append("image", captureOverride);
    });
  }

  async function extractExample(example: string) {
    await runExtraction((formData) => formData.append("example", example));
  }

  async function saveResult() {
    // The disabled button is the first guard; this is the second, for a
    // double tap that lands before React has re-rendered.
    if (!result || saveState !== "idle") return;
    setSaveState("saving");
    setError(null);

    let savedCount = 0;
    for (const product of result.products) {
      const saved = await saveReviewedProduct({
        name: product.name.trim(),
        canonical_name: "",
        category: product.category,
        description: product.description.trim(),
        language_detected: result.language_detected,
        price: product.price,
        quantity_unit: product.quantity_unit,
        stock_quantity: 0,
        stock_unit: product.stock_unit ?? "unit",
        low_stock_threshold: 0,
        image_url: null,
        audio_url: null,
      }, product.stock_quantity ?? 1);

      if (!saved.ok) {
        // Items before this one are already in the catalog. Say so rather than
        // letting the merchant think nothing was saved and try again.
        setError(savedCount > 0
          ? `Saved ${savedCount} of ${result.products.length}. ${saved.error}`
          : saved.error);
        setSaveState("idle");
        await refreshCatalogCount();
        return;
      }
      savedCount += 1;
    }

    setSaveState("saved");
    await refreshCatalogCount();
  }

  return (
    <main className="shelf-main mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden px-4 pb-6 pt-2 sm:px-5">
      <header className="shelf-header sticky top-0 z-20 -mx-4 px-4 sm:-mx-5 sm:px-5">
        <div className="glass-layer" aria-hidden="true" />
        <div className="relative z-10 flex min-h-[72px] items-center justify-between"><div><h1 className="font-display text-[24px] leading-[1.15] text-ink">शेल्फ़</h1><p className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-faint">SHELF</p></div>
        <a href="/catalog" className="touch-control inline-flex items-center gap-2 rounded-pill border border-hairline bg-white/60 px-4 text-sm font-semibold text-ink active:bg-sunken">Catalog{catalogCount !== null && <span className="count-badge">{catalogCount}</span>}</a></div>
      </header>
      <div className="mode-toggle mt-4 grid h-12 grid-cols-2 rounded-pill bg-sunken p-1" role="tablist">
        {(["speak", "photo"] as const).map((option) => (
          <button key={option} type="button" role="tab" aria-selected={mode === option} disabled={processing} onClick={() => chooseMode(option)} className={`touch-control min-h-10 rounded-pill text-[15px] font-semibold active:bg-black/5 disabled:opacity-40 ${mode === option ? "bg-ink text-white" : "text-muted"}`}>
            {option === "speak" ? "Speak" : "Photo"}
          </button>
        ))}
      </div>

      <section className="relative mt-4 rounded-card">
        <div className="glass-layer" aria-hidden="true" />
        <div className="relative z-10 flex h-[320px] flex-col p-4">
          <div className="flex items-center justify-between gap-3 text-[13px] text-faint"><span className="truncate">Try: 5 packet Parle-G, 10 rupees each</span><div className="relative shrink-0"><button type="button" onClick={() => setLanguageOpen((open) => !open)} className="touch-control inline-flex h-8 items-center gap-1 rounded-pill border border-hairline bg-white/70 px-3 text-sm text-muted active:bg-black/5"><span className="font-deva">{language}</span><ChevronDown size={15} /></button>{languageOpen && <div className="absolute right-0 top-10 z-20 min-w-36 rounded-card border border-hairline bg-white p-1 shadow-card">{["हिन्दी", "தமிழ்", "मराठी", "বাংলা", "English"].map((option) => <button key={option} type="button" onClick={() => { setLanguage(option); setLanguageOpen(false); }} className="touch-control flex w-full rounded-pill px-3 text-left text-sm text-ink active:bg-black/5"><span className={option !== "English" ? "font-deva" : ""}>{option}</span></button>)}</div>}</div></div>

          <div className="flex flex-1 items-center justify-center" aria-live="polite">
        {processing ? <div className="flex flex-col items-center gap-4"><span className="shimmer-line" /><p className="text-[15px] text-muted" role="status">Reading your items…</p></div> : mode === "speak" ? <VoiceRecorder key={recorderKey} onStatusChange={(nextStatus) => { if (!processing && !result) setStatus(nextStatus); }} onComplete={(blob) => { setCapture(blob); void extract(blob); }} /> : <label className="photo-picker flex w-full cursor-pointer flex-col items-center gap-4 rounded-card border border-hairline bg-white/70 p-6 text-center active:bg-surface-raised">
          {preview ? <Image src={preview} alt="Selected shelf" width={480} height={256} unoptimized className="max-h-48 w-full rounded-md object-contain" /> : <span className="flex size-16 items-center justify-center rounded-full bg-surface-raised text-accent"><ImagePlus size={28} aria-hidden /></span>}
          <span className="flex items-center gap-2 font-semibold text-ink"><Camera size={19} aria-hidden />{preview ? "Choose another photo" : "Choose a shelf photo"}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic" className="sr-only" onChange={choosePhoto} />
        </label>}
          </div>
        </div>
      </section>

      {error && <div className="mt-4 rounded-card border border-hairline bg-surface p-4 text-sm text-accent" role="alert">{error}</div>}
      {!result ? <Examples onExample={(example) => void extractExample(example)} /> : <Results result={result} setResult={setResult} />}
      {result && <button type="button" onClick={() => void saveResult()} disabled={saveState !== "idle"} aria-busy={saveState === "saving"} className={`sticky bottom-4 z-10 mt-4 min-h-[52px] w-full rounded-pill px-5 text-base font-semibold text-white shadow-card active:scale-[.98] disabled:active:scale-100 ${saveState === "saved" ? "bg-success" : "bg-ink disabled:opacity-70"}`}>{saveLabel(saveState, result.products.length)}</button>}
      <p className="sr-only" aria-live="polite">Current capture status: {status}</p>
    </main>
  );
}

function Results({ result, setResult }: { result: Result; setResult: (result: Result) => void }) {
  return <section className="relative mt-4 rounded-card"><div className="glass-layer" aria-hidden="true" /><div className="relative z-10 p-4"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-faint">Parsed items</p><div className="flex flex-col gap-3">{result.products.map((product, index) => <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut", delay: index * 0.05 }} key={`${product.name}-${index}`} className="result-card p-4"><div className="flex items-start justify-between gap-3"><input aria-label="Product name" value={product.name} onChange={(event) => { const products = result.products.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item); setResult({ ...result, products }); }} className="min-w-0 flex-1 bg-transparent text-base font-semibold text-primary outline-none" /><Pencil size={16} className="mt-1 shrink-0 text-muted" aria-hidden /></div><div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-secondary"><span>{product.stock_quantity ?? 1} {product.stock_unit ?? "unit"}</span><span>·</span><span>{product.price === null ? "Price not set" : `₹${product.price}`}</span><span className="category-chip">{product.category}</span></div></motion.article>)}</div></div></section>;
}

function Examples({ onExample }: { onExample: (example: string) => void }) {
  const examples = ["दो किलो चीनी, चालीस रुपये किलो", "5 packet Parle-G, 10 rupees each", "Ek dozen ande, 80 rupaye"];
  return <section className="relative mt-4 rounded-card"><div className="glass-layer" aria-hidden="true" /><div className="relative z-10 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint">Say it like this</p><div className="mt-3 flex flex-col gap-2">{examples.map((example) => <button key={example} type="button" onClick={() => onExample(example)} className="touch-control min-h-11 rounded-pill border border-hairline bg-white/70 px-4 text-left text-sm text-ink active:bg-sunken"><span className={/[^\x00-\x7F]/.test(example) ? "font-deva" : ""}>{example}</span></button>)}</div></div></section>;
}

function saveLabel(saveState: SaveState, count: number): string {
  const items = `${count} ${count === 1 ? "item" : "items"}`;
  if (saveState === "saving") return `Saving ${items}…`;
  if (saveState === "saved") return `✓ Added ${items} — opening catalog`;
  return `Add ${items} to catalog`;
}

