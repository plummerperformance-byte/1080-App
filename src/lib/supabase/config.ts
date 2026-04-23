/**
 * Supabase client-side configuration.
 *
 * Both values below are safe to commit and ship in the browser bundle:
 *   - The project URL is public (it's the hostname of every API call the
 *     browser makes).
 *   - The "publishable" key is Supabase's name for the client-safe API key
 *     (format `sb_publishable_…`). It maps to the `anon` Postgres role and
 *     is gated by RLS policies. It is the intended replacement for the
 *     legacy JWT `anon` key and, like it, is designed to be public.
 *
 * We still honour NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * as overrides for local dev or future environment splits, but Phase 1 does
 * not require them to be set.
 *
 * Rotation: if the publishable key is ever rotated in the Supabase dashboard,
 * replace the constant below. For multi-env setups in Phase 2, switch to
 * env vars and set them on Vercel.
 */

const FALLBACK_URL = "https://mjjxwiszqagpdmldkzwt.supabase.co";
const FALLBACK_ANON_KEY = "sb_publishable_yxn6DX6WwiSzjnnc7h1-XA_MtDjjEXq";

export const SUPABASE_URL: string =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_URL;

export const SUPABASE_ANON_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_ANON_KEY;
