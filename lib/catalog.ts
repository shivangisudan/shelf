/**
 * One product should be one catalog row. These helpers decide when two captures
 * are "the same product", and they are the single source of truth for that —
 * the extract route, the save path, and the local fallback all call them.
 *
 * The SQL side mirrors this in supabase/schema.sql (normalize_stock_unit and
 * the canonical_name backfill). The two agree on ASCII and on Indic scripts.
 * They differ on accented Latin: TS folds "café" to "cafe", Postgres leaves the
 * accent (unaccent is not assumed installed). That is harmless in practice —
 * the app always writes canonical_name from this file, and the SQL version only
 * ever runs as a backfill for legacy rows.
 */

const NAME_ALIASES: Record<string, string> = {
  aata: "atta",
  flour: "atta",
  wheatflour: "atta",
  cheeni: "sugar",
  chini: "sugar",
  shakkar: "sugar",
};

/**
 * Units the merchant typed, grouped by what they actually mean. Comparison
 * only — the merchant's own wording stays in stock_unit so the catalog still
 * reads back the way they said it.
 */
const UNIT_ALIASES: Record<string, string> = {
  packet: "packet", packets: "packet", pack: "packet", packs: "packet", pkt: "packet", pkts: "packet",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", kilogramme: "kg",
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g",
  l: "l", ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  piece: "piece", pieces: "piece", pcs: "piece", pc: "piece", nos: "piece",
  unit: "unit", units: "unit",
  bottle: "bottle", bottles: "bottle",
  tube: "tube", tubes: "tube",
  box: "box", boxes: "box",
  bag: "bag", bags: "bag",
  pouch: "pouch", pouches: "pouch",
  dozen: "dozen", dozens: "dozen",
};

/**
 * Stock unit written by a dedupe merge that had to combine incompatible units.
 * It means "this total spans more than one unit", so it is treated as unknown
 * rather than as a unit that could conflict with the next restock.
 */
export const MIXED_UNIT = "mixed";

export function canonicalProductName(value: string): string {
  const compact = value
    .normalize("NFKD")
    .toLowerCase()
    // Latin combining marks only, so "café" folds to "cafe" while Devanagari
    // and Tamil matras — which carry meaning — survive.
    .replace(/[̀-ͯ]/g, "")
    // Keep every script's letters, digits and combining marks. An ASCII-only
    // strip collapsed "चीनी" and "आटा" to the same empty key. Marks have to
    // stay too: Indic vowel signs are marks, not letters, so dropping them
    // turns "चीनी" (sugar) and "चना" (chickpeas) into the same key.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
  return NAME_ALIASES[compact] ?? compact;
}

export function normalizeUnit(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.trim().toLowerCase().replace(/\.+$/, "");
  if (!compact) return null;
  return UNIT_ALIASES[compact] ?? compact;
}

/** Unknown on either side is permissive; only two known, different units clash. */
export function compatibleUnits(first: string | null, second: string | null): boolean {
  const left = normalizeUnit(first);
  const right = normalizeUnit(second);
  if (!left || !right) return true;
  if (left === MIXED_UNIT || right === MIXED_UNIT) return true;
  return left === right;
}
