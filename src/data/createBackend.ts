import type { Backend } from './backend';
import { DemoBackend } from './demoBackend';
import { SupabaseBackend } from './supabaseBackend';

/**
 * Pick the backend from build-time settings:
 *   VITE_BACKEND=demo                           → data stays in this browser
 *   VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY → your Supabase project
 * Without Supabase settings the app falls back to demo mode, so a fresh clone runs straight away.
 */
export function createBackend(): Backend {
  const env = import.meta.env;
  const url = env.VITE_SUPABASE_URL as string | undefined;
  const key = env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (env.VITE_BACKEND !== 'demo' && url && key) return new SupabaseBackend(url, key);
  return new DemoBackend();
}
