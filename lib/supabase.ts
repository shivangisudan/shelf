import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Both are NEXT_PUBLIC_ so they inline into the browser bundle at build time.
// Next.js only inlines literal `process.env.X` references, never dynamic
// lookups, so these two must be written out in full.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// New-style publishable key (sb_publishable_...), not the legacy anon JWT.
// It is safe in the client; row access is governed by RLS. The Gemini key is
// not public and never leaves the server.
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
  );
}

/**
 * Single shared browser client. Shelf has no auth and no accounts, so session
 * persistence and token refresh are both switched off — every request is
 * anonymous.
 */
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
