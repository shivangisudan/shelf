/**
 * The complete, closed category list. Gemini is constrained to these values and
 * the review screen only ever offers these. Adding a category here is the only
 * way a new one enters the product.
 */
export const CATEGORIES = [
  "Grocery & Staples",
  "Snacks & Beverages",
  "Personal Care",
  "Household",
  "Stationery",
  "Apparel & Textiles",
  "Handicrafts",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Type-only view of lucide-react's exports, so a typo fails the build. */
type LucideIconName = Extract<keyof typeof import("lucide-react"), string>;

/**
 * Stand-in mark for a product with no photo. Import the named icon from
 * lucide-react at the call site: `icons[CATEGORY_ICON[product.category]]`.
 */
export const CATEGORY_ICON: Record<Category, LucideIconName> = {
  "Grocery & Staples": "Wheat",
  "Snacks & Beverages": "CupSoda",
  "Personal Care": "SprayCan",
  Household: "Home",
  Stationery: "Pencil",
  "Apparel & Textiles": "Shirt",
  Handicrafts: "Palette",
  Other: "Package",
};

/** Narrows an untrusted string (e.g. a Gemini response) to a known category. */
export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
  );
}
