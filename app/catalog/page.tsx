"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, PackageCheck, RefreshCw, TrendingDown, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyInventoryEvent, listInventoryEvents, listProducts } from "@/lib/db";
import type { InventoryEvent, Product } from "@/lib/types";

function localDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function statusFor(product: Product): "In stock" | "Low stock" | "Out of stock" {
  if (product.stock_quantity <= 0) return "Out of stock";
  if (product.low_stock_threshold > 0 && product.stock_quantity <= product.low_stock_threshold) return "Low stock";
  return "In stock";
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(localDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadCatalog() {
    setError(null);
    const [productResult, eventResult] = await Promise.all([listProducts(), listInventoryEvents()]);
    if (!productResult.ok || !eventResult.ok) {
      setError(!productResult.ok ? productResult.error : eventResult.error);
      setLoading(false);
      return;
    }
    setProducts(productResult.data);
    setEvents(eventResult.data);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedEvents = useMemo(
    () => events.filter((event) => localDate(event.created_at) === selectedDate),
    [events, selectedDate],
  );
  const stockAdded = selectedEvents
    .filter((event) => event.event_type === "extraction" || event.event_type === "restock")
    .reduce((sum, event) => sum + Math.max(0, event.quantity_delta), 0);
  const totalStock = products.reduce((sum, product) => sum + product.stock_quantity, 0);
  const outOfStock = products.filter((product) => statusFor(product) === "Out of stock").length;
  const lowStock = products.filter((product) => statusFor(product) === "Low stock").length;

  const categoryBars = useMemo(() => {
    const totals = new Map<string, number>();
    products.forEach((product) => totals.set(product.category, (totals.get(product.category) ?? 0) + product.stock_quantity));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [products]);
  const maxCategory = Math.max(1, ...categoryBars.map(([, value]) => value));

  async function changeStock(product: Product, type: "restock" | "out_of_stock") {
    const amountInput = document.getElementById(`restock-${product.id}`) as HTMLInputElement | null;
    const unitInput = document.getElementById(`unit-${product.id}`) as HTMLInputElement | null;
    const amount = type === "out_of_stock" ? -product.stock_quantity : Number(amountInput?.value ?? 0);
    const unit = unitInput?.value.trim() || product.stock_unit;
    if (type === "restock" && (!Number.isFinite(amount) || amount <= 0)) {
      setError("Enter a restock amount greater than zero.");
      return;
    }
    if (product.stock_unit && unit && product.stock_unit.toLowerCase() !== unit.toLowerCase()) {
      setError(`Use the existing stock unit (${product.stock_unit}) for ${product.name}.`);
      return;
    }
    setRefreshing(true);
    setError(null);
    const result = await applyInventoryEvent(product.id, type, amount, unit);
    if (!result.ok) setError(result.error);
    await loadCatalog();
    setRefreshing(false);
  }

  return (
    <main className="catalog-shell mx-auto min-h-screen w-full max-w-6xl px-5 pb-16 pt-7 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-secondary hover:text-primary"><ArrowLeft size={18} aria-hidden /> Capture</Link>
          <h1 className="type-title mt-5">Inventory overview</h1>
          <p className="mt-2 text-secondary">A clear view of what is on your shelf today.</p>
        </div>
        <button type="button" onClick={() => void loadCatalog()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong bg-white/70 px-4 text-sm font-semibold text-primary disabled:opacity-50" disabled={loading || refreshing}><RefreshCw size={17} aria-hidden /> Refresh</button>
      </header>

      {error && <div className="mt-7 rounded-2xl bg-error-bg p-4 text-error" role="alert">{error}</div>}
      {loading ? <div className="mt-10 rounded-3xl bg-white/70 p-8 text-center text-secondary">Loading your catalogue...</div> : (
        <>
          <section className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Inventory summary">
            <Metric icon={<Warehouse size={20} />} label="Total stock" value={formatNumber(totalStock)} detail="Across all products" />
            <Metric icon={<PackageCheck size={20} />} label="Products" value={String(products.length)} detail="In your catalogue" />
            <Metric icon={<TrendingDown size={20} />} label="Low / out" value={`${lowStock} / ${outOfStock}`} detail="Needs attention" />
            <Metric icon={<CalendarDays size={20} />} label="Added on date" value={formatNumber(stockAdded)} detail={selectedDate === localDate(new Date()) ? "Today" : selectedDate} />
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="catalog-panel rounded-3xl p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Stock mix</p><h2 className="mt-1 text-xl font-bold text-primary">By category</h2></div><span className="text-sm text-secondary">{products.length} products</span></div>
              {categoryBars.length === 0 ? <Empty text="Your category chart will appear after the first product is added." /> : <div className="mt-7 flex h-56 items-end gap-3 border-b border-border px-2 sm:gap-6">{categoryBars.map(([category, value]) => <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={category}><span className="text-xs font-bold text-primary">{formatNumber(value)}</span><div className="isometric-bar w-full max-w-12 rounded-t-xl bg-gradient-warm" style={{ height: `${Math.max(10, (value / maxCategory) * 170)}px` }} title={`${category}: ${formatNumber(value)}`} /><span className="w-full truncate text-center text-xs text-secondary" title={category}>{category.split(" ")[0]}</span></div>)}</div>}
            </div>
            <div className="catalog-panel rounded-3xl p-6">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Activity</p><h2 className="mt-1 text-xl font-bold text-primary">Calendar metrics</h2></div>
              <label className="mt-6 block text-sm font-semibold text-secondary">Choose a date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 text-base text-primary outline-none focus:border-accent" /></label>
              <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-raised p-4"><p className="text-xs text-secondary">Stock added</p><p className="mt-1 text-2xl font-bold text-primary">{formatNumber(stockAdded)}</p></div><div className="rounded-2xl bg-surface-raised p-4"><p className="text-xs text-secondary">Events</p><p className="mt-1 text-2xl font-bold text-primary">{selectedEvents.length}</p></div></div>
              <p className="mt-4 text-sm text-secondary">{selectedEvents.length === 0 ? "No stock activity recorded on this date." : `${new Set(selectedEvents.map((event) => event.product_id)).size} products affected.`}</p>
            </div>
          </section>

          <section className="mt-9"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Live catalogue</p><h2 className="mt-1 text-2xl font-bold text-primary">Your products</h2></div><p className="text-sm text-secondary">{events.filter((event) => event.event_type === "out_of_stock").length} stock alerts recorded</p></div>
            {products.length === 0 ? <div className="catalog-panel mt-5 rounded-3xl p-8 text-center text-secondary">No products yet. Capture a voice note or shelf photo to start.</div> : <div className="mt-5 grid gap-4">{products.map((product) => <ProductRow key={product.id} product={product} busy={refreshing} onChange={changeStock} />)}</div>}
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="catalog-panel rounded-2xl p-5"><div className="flex items-center gap-2 text-accent">{icon}<span className="text-xs font-bold uppercase tracking-[0.12em] text-secondary">{label}</span></div><p className="mt-3 text-3xl font-bold tracking-tight text-primary">{value}</p><p className="mt-1 text-sm text-secondary">{detail}</p></div>;
}

function ProductRow({ product, busy, onChange }: { product: Product; busy: boolean; onChange: (product: Product, type: "restock" | "out_of_stock") => void }) {
  const status = statusFor(product);
  return <article className="catalog-panel rounded-3xl p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-primary">{product.name}</h3><p className="mt-1 text-sm text-secondary">{product.category} {product.quantity_unit ? `· ${product.quantity_unit}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "In stock" ? "bg-success-bg text-success" : status === "Low stock" ? "bg-accent/10 text-accent" : "bg-error-bg text-error"}`}>{status}</span></div><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.12em] text-secondary">Current stock</p><p className="mt-1 text-3xl font-bold text-primary">{formatNumber(product.stock_quantity)} <span className="text-base font-semibold text-secondary">{product.stock_unit ?? "units"}</span></p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-secondary">Add stock<input id={`restock-${product.id}`} type="number" min="0" placeholder="0" className="mt-1 h-11 w-24 rounded-xl border border-border-strong bg-white/80 px-3 text-base text-primary outline-none focus:border-accent" /></label><label className="text-xs font-semibold text-secondary">Unit<input id={`unit-${product.id}`} defaultValue={product.stock_unit ?? ""} placeholder="kg" className="mt-1 h-11 w-24 rounded-xl border border-border-strong bg-white/80 px-3 text-base text-primary outline-none focus:border-accent" /></label><button type="button" disabled={busy} onClick={() => onChange(product, "restock")} className="h-11 rounded-xl bg-gradient-warm px-4 text-sm font-bold text-accent-fg disabled:opacity-50">Restock</button><button type="button" disabled={busy || product.stock_quantity <= 0} onClick={() => onChange(product, "out_of_stock")} className="h-11 rounded-xl border border-error/30 px-4 text-sm font-bold text-error disabled:opacity-40">Out of stock</button></div></div></article>;
}

function Empty({ text }: { text: string }) {
  return <p className="mt-7 rounded-2xl bg-surface-raised p-5 text-sm text-secondary">{text}</p>;
}
