import { createClient } from '@supabase/supabase-js';
import type { H3Event } from 'h3';

export function createServerSupabase(event: H3Event) {
  const config = useRuntimeConfig();
  const authorization = getHeader(event, 'authorization');

  return createClient(
    config.public.supabaseUrl,
    config.public.supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: authorization ? { Authorization: authorization } : {}
      }
    }
  );
}

export async function requireUser(event: H3Event) {
  const supabase = createServerSupabase(event);
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    });
  }

  return { supabase, user };
}
