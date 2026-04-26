"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function supabaseBrowser() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars not set in the browser. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.",
    );
  }
  cached = createBrowserClient<Database>(url, key);
  return cached;
}
