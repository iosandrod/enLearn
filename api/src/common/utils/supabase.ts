import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { getEnv } from './env';
import type { ServiceContext } from '../interfaces/service-executor';

type ClientMode = 'public' | 'user' | 'admin';

export type AccountRole = 'owner' | 'member';

export type AccountSummary = {
  account_id: string;
  account_role: AccountRole;
  is_primary_owner: boolean;
  name: string | null;
  slug: string | null;
  personal_account: boolean;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserAuthorization = {
  profile: Record<string, unknown> | null;
  permissionCodes: string[];
  accounts: AccountSummary[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFunctionError(error: { message?: string; code?: string } | null | undefined) {
  return (
    error?.code === 'PGRST202' ||
    Boolean(error?.message?.includes('Could not find the function')) ||
    Boolean(error?.message?.includes('function') && error.message.includes('does not exist'))
  );
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function normalizeAccounts(value: unknown): AccountSummary[] {
  if (!Array.isArray(value)) return [] as AccountSummary[];

  return value
    .filter(isRecord)
    .map((account): AccountSummary => {
      const accountRole: AccountRole = account.account_role === 'member' ? 'member' : 'owner';

      return {
        account_id: String(account.account_id ?? ''),
        account_role: accountRole,
        is_primary_owner: account.is_primary_owner === true,
        name: typeof account.name === 'string' ? account.name : null,
        slug: typeof account.slug === 'string' ? account.slug : null,
        personal_account: account.personal_account === true,
        metadata: isRecord(account.metadata) ? account.metadata : null,
        created_at: typeof account.created_at === 'string' ? account.created_at : null,
        updated_at: typeof account.updated_at === 'string' ? account.updated_at : null
      };
    })
    .filter((account) => account.account_id);
}

function normalizeRequiredPermissions(requiredPermissions?: string | string[]) {
  if (!requiredPermissions) return [] as string[];
  return (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .map((code) => code.trim())
    .filter(Boolean);
}

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

export async function getUserAuthorization(
  client: SupabaseClient,
  userId: string
): Promise<UserAuthorization> {
  const [{ data: profile, error: profileError }, permissionsResult, accountsResult] =
    await Promise.all([
      client.from('users').select('*').eq('id', userId).maybeSingle(),
      client.rpc('current_user_permission_codes'),
      client.rpc('get_accounts')
    ]);

  if (profileError) {
    throw new ForbiddenException(profileError.message);
  }

  const permissionError = permissionsResult.error;
  if (permissionError && !isMissingFunctionError(permissionError)) {
    throw new ForbiddenException(permissionError.message);
  }

  const accountsError = accountsResult.error;
  if (accountsError && !isMissingFunctionError(accountsError)) {
    throw new ForbiddenException(accountsError.message);
  }

  return {
    profile: (profile as Record<string, unknown> | null) ?? null,
    permissionCodes: normalizeStringArray(permissionsResult.data),
    accounts: normalizeAccounts(accountsResult.data)
  };
}

export function hasRequiredPermission(
  authorization: Pick<UserAuthorization, 'permissionCodes'>,
  requiredPermissions?: string | string[]
) {
  const required = normalizeRequiredPermissions(requiredPermissions);

  if (!required.length) {
    return false;
  }

  return required.some((code) => authorization.permissionCodes.includes(code));
}

export async function requireAdmin(
  context: ServiceContext,
  requiredPermissions?: string | string[]
) {
  const { client, user } = await getCurrentUser(context);
  const authorization = await getUserAuthorization(client, user.id);

  if (!hasRequiredPermission(authorization, requiredPermissions)) {
    throw new ForbiddenException('Admin permission required.');
  }

  return { client, user, ...authorization };
}
