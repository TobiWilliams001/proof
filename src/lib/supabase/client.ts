'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** True when the project's Supabase details are set, so sign-in can work. */
export const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/**
 * The browser's Supabase client. The session lives in localStorage, which also
 * works inside the installed app, and every query runs as the signed-in trader,
 * so row level security decides what they can see.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'proof.auth' },
    });
  }
  return client;
}

/** fetch for Proof's own API: adds the trader's sign-in so the server knows who's asking. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase().auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
