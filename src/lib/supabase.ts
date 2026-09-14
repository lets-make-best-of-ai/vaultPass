import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!url || !key) {
        _client = {} as SupabaseClient;
      } else {
        _client = createClient(url, key, {
          auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
        });
      }
    } catch {
      _client = {} as SupabaseClient;
    }
  }
  return _client;
}
