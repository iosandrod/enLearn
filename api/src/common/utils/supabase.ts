import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { getEnv } from './env';
import type { ServiceContext } from '../interfaces/service-executor';

type ClientMode = 'public' | 'user' | 'admin';

function resolveSupabaseConfig() {
  const env = getEnv();
  const supabaseUrl =
    env.SUPABASE_URL ??
    env.NEXT_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_PROJECT_URL ??
    '';
  const supabaseAnonKey =
    env.SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    '';
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL.');
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing Supabase anon/publishable key.');
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey
  };
}

export function createSupabaseClient(
  mode: ClientMode = 'public',
  context?: ServiceContext
): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } =
    resolveSupabaseConfig();

  const key = mode === 'admin' ? supabaseServiceRoleKey || supabaseAnonKey : supabaseAnonKey;
  const headers: Record<string, string> = {};
  if (mode === 'user' && context?.authorization) {
    headers.Authorization = context.authorization;
  }

  if (mode === 'admin' && !supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for payment/customer writes.'
    );
  }

  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: Object.keys(headers).length ? { headers } : undefined
  });
}

export async function getCurrentUser(context: ServiceContext) {
  const client = createSupabaseClient('user', context);
  const {
    data: { user },
    error
  } = await client.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedException('Authentication required.');
  }

  return { client, user };
}

export async function requireAdmin(context: ServiceContext) {
  const { client, user } = await getCurrentUser(context);
  const { data: profile, error } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new ForbiddenException(error.message);
  }

  if (profile?.role !== 'admin') {
    throw new ForbiddenException('Admin access required.');
  }

  return { client, user, profile };
}
