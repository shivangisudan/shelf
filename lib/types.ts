import type { Category } from "./taxonomy";

/**
 * A single catalog entry. Mirrors the `products` table in Supabase exactly —
 * see supabase/schema.sql. Every field except the identifiers is editable by
 * the merchant before the row is ever written.
 */
export type Product = {
  id: string;
  name: string;
  canonical_name: string;
  category: Category;
  description: string;
  /** BCP-47-ish tag or plain language name as detected from the voice note. */
  language_detected: string;
  price: number | null;
  /** Free text, e.g. "1 kg", "500 ml", "per dozen". */
  quantity_unit: string | null;
  stock_quantity: number;
  stock_unit: string | null;
  low_stock_threshold: number;
  image_url: string | null;
  audio_url: string | null;
  /** ISO 8601 timestamptz, assigned by Postgres on insert. */
  created_at: string;
};

/** A product as it exists before Postgres assigns an id and a timestamp. */
export type ProductDraft = Omit<Product, "id" | "created_at">;

export type InventoryEventType = "extraction" | "restock" | "out_of_stock" | "adjustment";

export type InventoryEvent = {
  id: string;
  product_id: string;
  event_type: InventoryEventType;
  quantity_delta: number;
  quantity_after: number;
  unit: string | null;
  source: string;
  created_at: string;
};

export type DashboardData = {
  products: Product[];
  events: InventoryEvent[];
};

/** Result envelope used by every function in lib/db.ts. Nothing throws. */
export type Result<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: string };

/**
 * Minimal hand-written stand-in for Supabase's generated schema types, so
 * `supabase.from("products")` is checked against Product rather than `any`.
 * `id` and `created_at` are optional on insert — Postgres fills both.
 */
export type Database = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: ProductDraft & { id?: string; created_at?: string };
        Update: Partial<ProductDraft>;
        /** No foreign keys — products is a single flat table. */
        Relationships: [];
      };
      inventory_events: {
        Row: InventoryEvent;
        Insert: Omit<InventoryEvent, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<InventoryEvent, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_inventory_event: {
        Args: {
          p_product_id: string;
          p_event_type: InventoryEventType;
          p_quantity_delta: number;
          p_unit?: string | null;
          p_source?: string;
        };
        Returns: Product;
      };
      /**
       * Find-or-insert by canonical_name plus the opening stock event, in one
       * transaction. Two simultaneous saves of the same product converge on a
       * single row instead of racing to insert two.
       */
      save_reviewed_product: {
        Args: {
          p_name: string;
          p_canonical_name: string;
          p_category: Category;
          p_description: string;
          p_language_detected: string;
          p_price: number | null;
          p_quantity_unit: string | null;
          p_stock_unit: string | null;
          p_low_stock_threshold: number;
          p_image_url: string | null;
          p_audio_url: string | null;
          p_initial_stock: number;
        };
        Returns: Product;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Lifecycle of a voice capture, shared by the recorder and its visualization. */
export type VoiceState = "idle" | "recording" | "processing";

/**
 * Lifecycle of the voice recorder. "cleared" in the capture flow is a return
 * to "idle" with the previous take discarded, so it needs no state of its own.
 */
export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "recorded"
  | "denied";
