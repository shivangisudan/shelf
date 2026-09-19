import { supabase } from "./supabase";
import { MIXED_UNIT, canonicalProductName, compatibleUnits, normalizeUnit } from "./catalog";
import type {
  InventoryEvent,
  InventoryEventType,
  Product,
  ProductDraft,
  Result,
} from "./types";

const TABLE = "products";
const EVENTS_TABLE = "inventory_events";
const LOCAL_PRODUCTS = "shelf-demo-products";
const LOCAL_EVENTS = "shelf-demo-inventory-events";

/** Supabase errors are opaque objects; this keeps them displayable. */
function message(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.length > 0) return value;
  }
  return fallback;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string") return value;
  }
  return "";
}

function isNetworkFailure(error: unknown): boolean {
  const text = [message(error, ""), String(error ?? "")].join(" ");
  return /failed to fetch|name_not_resolved|network error|fetch failed/i.test(text);
}

/**
 * Another save inserted the same canonical product first. The unique partial
 * index on canonical_name is what turns the race into this error instead of a
 * second row.
 */
function isUniqueViolation(error: unknown): boolean {
  if (errorCode(error) === "23505") return true;
  return /duplicate key value violates unique constraint/i.test(message(error, ""));
}

/** PostgREST's "function does not exist" — the schema migration has not been run. */
function isMissingFunction(error: unknown): boolean {
  if (errorCode(error) === "PGRST202") return true;
  return /could not find the function/i.test(message(error, ""));
}

/**
 * The unit to record against an existing product. A 'mixed' unit was written
 * by a dedupe merge to mean "this total spans more than one unit" — replacing
 * it with whatever the merchant just said would mislabel the whole quantity.
 */
function unitForExisting(existing: Product, incoming: string | null): string | null {
  return normalizeUnit(existing.stock_unit) === MIXED_UNIT ? null : incoming;
}

function unitConflict(name: string, existingUnit: string | null): string {
  return `${name} already uses ${existingUnit ?? "another unit"}. Review the stock unit before adding it.`;
}

function readLocal<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function withTimeout<T>(request: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(request),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Failed to fetch")), 2500);
    }),
  ]);
}

function localProduct(product: ProductDraft): Product {
  return {
    ...product,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local fallback catalog
//
// When Supabase is unreachable the browser is the database, so it needs the
// same "one row per canonical product" guarantee the server has. This is the
// localStorage twin of supabase/dedupe_catalog.sql and follows the same rules:
// oldest row wins, stock is summed rather than dropped, incompatible units
// collapse to "mixed", and every merge leaves an inventory event behind.
// ─────────────────────────────────────────────────────────────────────────────

function collapseLocalCatalog(rows: Product[], events: InventoryEvent[]) {
  // Oldest first, so the surviving row is the oldest one — same keeper rule as
  // the SQL migration.
  const ordered = [...rows].sort((left, right) => left.created_at.localeCompare(right.created_at));
  const keepers: Product[] = [];
  const byCanonicalName = new Map<string, Product>();
  const absorbedBy = new Map<string, string>();
  const mergeEvents: InventoryEvent[] = [];
  let changed = false;

  for (const row of ordered) {
    const key = canonicalProductName(row.canonical_name || row.name);
    if (key !== row.canonical_name) changed = true;
    const product: Product = { ...row, canonical_name: key };

    // A name with no letters or digits has no key we could match on, so it
    // stays its own row rather than merging with every other keyless row.
    const keeper = key ? byCanonicalName.get(key) : undefined;
    if (!keeper) {
      if (key) byCanonicalName.set(key, product);
      keepers.push(product);
      continue;
    }

    changed = true;
    absorbedBy.set(product.id, keeper.id);
    const absorbed = Number(product.stock_quantity) || 0;
    if (!compatibleUnits(keeper.stock_unit, product.stock_unit)) keeper.stock_unit = MIXED_UNIT;
    else if (!keeper.stock_unit) keeper.stock_unit = product.stock_unit;
    keeper.stock_quantity = (Number(keeper.stock_quantity) || 0) + absorbed;
    mergeEvents.push({
      id: crypto.randomUUID(),
      product_id: keeper.id,
      event_type: "adjustment",
      quantity_delta: absorbed,
      quantity_after: keeper.stock_quantity,
      unit: keeper.stock_unit,
      source: "local-dedupe",
      created_at: new Date().toISOString(),
    });
  }

  // Re-point history before the duplicate rows disappear, so nothing is orphaned.
  const relinked = events.map((event) => {
    const keeperId = absorbedBy.get(event.product_id);
    return keeperId ? { ...event, product_id: keeperId } : event;
  });

  return { products: keepers, events: [...relinked, ...mergeEvents], changed };
}

/**
 * Every local read goes through here, so duplicates left behind by older
 * versions of the app are collapsed the first time they are read and stay
 * collapsed afterwards.
 */
function readLocalProducts(): Product[] {
  const collapsed = collapseLocalCatalog(
    readLocal<Product>(LOCAL_PRODUCTS),
    readLocal<InventoryEvent>(LOCAL_EVENTS),
  );
  if (collapsed.changed) {
    writeLocal(LOCAL_PRODUCTS, collapsed.products);
    writeLocal(LOCAL_EVENTS, collapsed.events);
  }
  return collapsed.products;
}

function readLocalEvents(): InventoryEvent[] {
  readLocalProducts();
  // Newest first, matching the order Postgres returns.
  return readLocal<InventoryEvent>(LOCAL_EVENTS).sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

function applyLocalInventoryEvent(
  productId: string,
  eventType: InventoryEventType,
  quantityDelta: number,
  unit?: string | null,
): Result<Product> {
  const products = readLocalProducts();
  const product = products.find((item) => item.id === productId);
  if (!product) return { ok: false, data: null, error: "Product not found in the local catalogue." };
  const nextQuantity = eventType === "out_of_stock" ? 0 : Math.max(0, product.stock_quantity + quantityDelta);
  // coalesce, matching apply_inventory_event: only a null unit leaves the
  // existing one in place.
  const updated = { ...product, stock_quantity: nextQuantity, stock_unit: unit ?? product.stock_unit };
  writeLocal(LOCAL_PRODUCTS, products.map((item) => item.id === productId ? updated : item));
  const event: InventoryEvent = {
    id: crypto.randomUUID(),
    product_id: productId,
    event_type: eventType,
    quantity_delta: quantityDelta,
    quantity_after: nextQuantity,
    unit: updated.stock_unit,
    source: "local-demo",
    created_at: new Date().toISOString(),
  };
  writeLocal(LOCAL_EVENTS, [...readLocal<InventoryEvent>(LOCAL_EVENTS), event]);
  return { ok: true, data: updated, error: null };
}

function saveLocalReviewedProduct(product: ProductDraft, initialStock: number): Result<Product> {
  const key = canonicalProductName(product.name);
  const products = readLocalProducts();
  const existing = key ? products.find((item) => item.canonical_name === key) : undefined;
  if (existing) {
    if (!compatibleUnits(existing.stock_unit, product.stock_unit)) {
      return { ok: false, data: null, error: unitConflict(product.name, existing.stock_unit) };
    }
    return applyLocalInventoryEvent(
      existing.id, "extraction", initialStock, unitForExisting(existing, product.stock_unit),
    );
  }
  const saved = localProduct({ ...product, canonical_name: key, stock_quantity: 0 });
  writeLocal(LOCAL_PRODUCTS, [...products, saved]);
  return applyLocalInventoryEvent(saved.id, "extraction", initialStock, product.stock_unit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds one reviewed product to the catalog, merging into the existing row when
 * the merchant has captured this product before. The draft must already be
 * exactly what they approved — AI output is never saved without review.
 *
 * The work happens in the save_reviewed_product RPC so that find-or-insert and
 * the opening stock event share one transaction. Two saves firing at once
 * cannot produce two rows for the same product.
 */
export async function saveReviewedProduct(
  product: ProductDraft,
  initialStock: number,
): Promise<Result<Product>> {
  const canonicalName = canonicalProductName(product.name);
  try {
    const { data, error } = await withTimeout(supabase.rpc("save_reviewed_product", {
      p_name: product.name,
      p_canonical_name: canonicalName,
      p_category: product.category,
      p_description: product.description,
      p_language_detected: product.language_detected,
      p_price: product.price,
      p_quantity_unit: product.quantity_unit,
      p_stock_unit: product.stock_unit,
      p_low_stock_threshold: product.low_stock_threshold,
      p_image_url: product.image_url,
      p_audio_url: product.audio_url,
      p_initial_stock: initialStock,
    }));
    if (error) {
      if (isNetworkFailure(error)) return saveLocalReviewedProduct(product, initialStock);
      // The database predates this RPC. Fall back to doing it from here.
      if (isMissingFunction(error)) return saveReviewedProductInClient(product, initialStock, canonicalName);
      return { ok: false, data: null, error: message(error, "Could not save this product.") };
    }
    return data
      ? { ok: true, data, error: null }
      : { ok: false, data: null, error: "Saved, but the product came back empty." };
  } catch (cause) {
    if (isNetworkFailure(cause)) return saveLocalReviewedProduct(product, initialStock);
    return { ok: false, data: null, error: message(cause, "Could not reach the catalog. Check your connection.") };
  }
}

/**
 * Find-or-insert driven from the browser, for databases where
 * supabase/schema.sql has not been re-run and the RPC is missing. It cannot be
 * atomic, so it treats a unique violation as "someone else won the race" and
 * adds the stock to whichever row landed first.
 */
async function saveReviewedProductInClient(
  product: ProductDraft,
  initialStock: number,
  canonicalName: string,
): Promise<Result<Product>> {
  const existing = await findByCanonicalName(canonicalName);
  if (!existing.ok) {
    if (existing.network) return saveLocalReviewedProduct(product, initialStock);
    return { ok: false, data: null, error: existing.error };
  }
  if (existing.data) return addStockTo(existing.data, product, initialStock);

  const inserted = await insertProductRow({ ...product, canonical_name: canonicalName, stock_quantity: 0 });
  if (inserted.ok) return addStockTo(inserted.data, product, initialStock);
  if (inserted.network) return saveLocalReviewedProduct(product, initialStock);
  if (!inserted.unique) return { ok: false, data: null, error: inserted.error };

  // Lost the race. Add the stock to whichever row landed first.
  const winner = await findByCanonicalName(canonicalName);
  if (!winner.ok) return { ok: false, data: null, error: winner.error };
  if (!winner.data) return { ok: false, data: null, error: "Could not save this product. Try again." };
  return addStockTo(winner.data, product, initialStock);
}

function addStockTo(existing: Product, product: ProductDraft, initialStock: number) {
  if (!compatibleUnits(existing.stock_unit, product.stock_unit)) {
    return Promise.resolve<Result<Product>>({
      ok: false,
      data: null,
      error: unitConflict(product.name, existing.stock_unit),
    });
  }
  return applyInventoryEvent(
    existing.id, "extraction", initialStock, unitForExisting(existing, product.stock_unit),
  );
}

type Outcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; network: boolean; unique: boolean };

function failure(error: unknown, fallback: string): Outcome<never> {
  return {
    ok: false,
    error: message(error, fallback),
    network: isNetworkFailure(error),
    unique: isUniqueViolation(error),
  };
}

/** Indexed single-row lookup — products_canonical_name_idx covers this. */
async function findByCanonicalName(canonicalName: string): Promise<Outcome<Product | null>> {
  if (!canonicalName) return { ok: true, data: null };
  try {
    const { data, error } = await withTimeout(supabase
      .from(TABLE)
      .select()
      .eq("canonical_name", canonicalName)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle());
    if (error) return failure(error, "Could not check the catalog.");
    return { ok: true, data: data ?? null };
  } catch (cause) {
    return failure(cause, "Could not reach the catalog.");
  }
}

async function insertProductRow(product: ProductDraft): Promise<Outcome<Product>> {
  try {
    const { data, error } = await withTimeout(supabase
      .from(TABLE)
      .insert(product)
      .select()
      .single());
    if (error) return failure(error, "Could not save this product.");
    if (!data) return failure(null, "Saved, but the product came back empty.");
    return { ok: true, data };
  } catch (cause) {
    return failure(cause, "Could not reach the catalog. Check your connection.");
  }
}

/**
 * Writes one reviewed product with no dedupe. Prefer saveReviewedProduct —
 * this is the raw insert underneath it.
 */
export async function insertProduct(product: ProductDraft): Promise<Result<Product>> {
  const inserted = await insertProductRow(product);
  if (inserted.ok) return { ok: true, data: inserted.data, error: null };
  if (inserted.network) {
    const saved = localProduct(product);
    writeLocal(LOCAL_PRODUCTS, [...readLocalProducts(), saved]);
    return { ok: true, data: saved, error: null };
  }
  return { ok: false, data: null, error: inserted.error };
}

export async function applyInventoryEvent(
  productId: string,
  eventType: InventoryEventType,
  quantityDelta: number,
  unit?: string | null,
): Promise<Result<Product>> {
  try {
    const { data, error } = await withTimeout(supabase.rpc("apply_inventory_event", {
      p_product_id: productId,
      p_event_type: eventType,
      p_quantity_delta: quantityDelta,
      p_unit: unit,
      p_source: "catalog",
    }));
    if (error) {
      if (isNetworkFailure(error)) return applyLocalInventoryEvent(productId, eventType, quantityDelta, unit);
      return { ok: false, data: null, error: message(error, "Could not update stock.") };
    }
    return data
      ? { ok: true, data, error: null }
      : { ok: false, data: null, error: "Stock update returned no product." };
  } catch (cause) {
    if (isNetworkFailure(cause)) return applyLocalInventoryEvent(productId, eventType, quantityDelta, unit);
    return { ok: false, data: null, error: message(cause, "Could not reach the catalog.") };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/** The full catalog, newest first. */
export async function listProducts(): Promise<Result<Product[]>> {
  try {
    const { data, error } = await withTimeout(supabase
      .from(TABLE)
      .select()
      .order("created_at", { ascending: false }));

    if (error) {
      if (isNetworkFailure(error)) {
        return { ok: true, data: readLocalProducts(), error: null };
      }
      return { ok: false, data: null, error: message(error, "Could not load the catalog.") };
    }
    return { ok: true, data: data ?? [], error: null };
  } catch (cause) {
    if (isNetworkFailure(cause)) {
      return { ok: true, data: readLocalProducts(), error: null };
    }
    return {
      ok: false,
      data: null,
      error: message(cause, "Could not reach the catalog. Check your connection."),
    };
  }
}

/** How many products are in the catalog, without pulling any rows over the wire. */
export async function countProducts(): Promise<Result<number>> {
  try {
    const { count, error } = await withTimeout(supabase
      .from(TABLE)
      .select("*", { count: "exact", head: true }));
    if (error) {
      if (isNetworkFailure(error)) return { ok: true, data: readLocalProducts().length, error: null };
      return { ok: false, data: null, error: message(error, "Could not count the catalog.") };
    }
    return { ok: true, data: count ?? 0, error: null };
  } catch (cause) {
    if (isNetworkFailure(cause)) return { ok: true, data: readLocalProducts().length, error: null };
    return { ok: false, data: null, error: message(cause, "Could not reach the catalog.") };
  }
}

export async function listInventoryEvents(): Promise<Result<InventoryEvent[]>> {
  try {
    const { data, error } = await withTimeout(supabase
      .from(EVENTS_TABLE)
      .select()
      .order("created_at", { ascending: false }));
    if (error) {
      if (isNetworkFailure(error)) {
        return { ok: true, data: readLocalEvents(), error: null };
      }
      return { ok: false, data: null, error: message(error, "Could not load stock history.") };
    }
    return { ok: true, data: data ?? [], error: null };
  } catch (cause) {
    if (isNetworkFailure(cause)) {
      return { ok: true, data: readLocalEvents(), error: null };
    }
    return { ok: false, data: null, error: message(cause, "Could not reach stock history.") };
  }
}
