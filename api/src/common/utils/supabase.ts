import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { getEnv } from './env';
import type { ServiceContext } from '../interfaces/service-executor';

type ClientMode = 'public' | 'user' | 'admin';
type CurrentUserResult = {
  client: SupabaseClient;
  user: User;
};

type UserAuthorizationOptions = {
  refresh?: boolean;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const AUTH_CACHE_TTL_MS = 10 * 60_000;
const AUTH_CACHE_MAX_ENTRIES = 200;
const currentUserCache = new Map<string, CacheEntry<CurrentUserResult>>();
const userAuthorizationCache = new Map<string, CacheEntry<UserAuthorization>>();

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
  isLegacyAdmin: boolean;
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

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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

function isLegacyAdminProfile(profile: Record<string, unknown> | null) {
  return typeof profile?.role === 'string' && profile.role.trim().toLowerCase() === 'admin';
}

function isMissingPermissionTableError(error: { message?: string } | Error | null | undefined) {
  const message = error instanceof Error ? error.message : error?.message ?? '';
  return (
    message.includes('admin_user_roles') ||
    message.includes('admin_roles') ||
    message.includes('admin_role_permissions') ||
    message.includes('admin_permissions')
  ) && message.includes('does not exist');
}

function isPermissionReadDenied(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return isMissingPermissionTableError(error) || message.includes('permission denied');
}

async function readPermissionCodesFromSupabase(client: SupabaseClient, userId: string) {
  const { data: userRoles, error: userRolesError } = await client
    .from('admin_user_roles')
    .select('role_id')
    .eq('user_id', userId);

  if (userRolesError) {
    if (isPermissionReadDenied(userRolesError)) return [] as string[];
    throw new ForbiddenException(userRolesError.message);
  }

  const roleIds = uniqueStrings(
    (userRoles ?? []).map((row: Record<string, unknown>) => String(row.role_id ?? ''))
  );
  if (!roleIds.length) return [] as string[];

  const { data: roles, error: rolesError } = await client
    .from('admin_roles')
    .select('id')
    .in('id', roleIds)
    .eq('status', 'active');

  if (rolesError) {
    if (isPermissionReadDenied(rolesError)) return [] as string[];
    throw new ForbiddenException(rolesError.message);
  }

  const activeRoleIds = uniqueStrings(
    (roles ?? []).map((row: Record<string, unknown>) => String(row.id ?? ''))
  );
  if (!activeRoleIds.length) return [] as string[];

  const { data: rolePermissions, error: rolePermissionsError } = await client
    .from('admin_role_permissions')
    .select('permission_id')
    .in('role_id', activeRoleIds);

  if (rolePermissionsError) {
    if (isPermissionReadDenied(rolePermissionsError)) return [] as string[];
    throw new ForbiddenException(rolePermissionsError.message);
  }

  const permissionIds = uniqueStrings(
    (rolePermissions ?? []).map((row: Record<string, unknown>) => String(row.permission_id ?? ''))
  );
  if (!permissionIds.length) return [] as string[];

  const { data: permissions, error: permissionsError } = await client
    .from('admin_permissions')
    .select('code')
    .in('id', permissionIds)
    .eq('status', 'active');

  if (permissionsError) {
    if (isPermissionReadDenied(permissionsError)) return [] as string[];
    throw new ForbiddenException(permissionsError.message);
  }

  return uniqueStrings(
    (permissions ?? []).map((row: Record<string, unknown>) => String(row.code ?? ''))
  );
}

async function readLegacyAdminPermissionCodes(client: SupabaseClient) {
  const { data, error } = await client
    .from('admin_permissions')
    .select('code')
    .eq('status', 'active');

  if (error) {
    if (isPermissionReadDenied(error)) return [] as string[];
    throw new ForbiddenException(error.message);
  }

  return uniqueStrings((data ?? []).map((row: Record<string, unknown>) => String(row.code ?? '')));
}

function normalizeRequiredPermissions(requiredPermissions?: string | string[]) {
  if (!requiredPermissions) return [] as string[];
  return (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .map((code) => code.trim())
    .filter(Boolean);
}

function trimCache<T>(cache: Map<string, CacheEntry<T>>) {
  const now = Date.now();

  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (cache.size > AUTH_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

function readCachedPromise<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  factory: () => Promise<T>
) {
  trimCache(cache);

  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = factory().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, {
    expiresAt: now + AUTH_CACHE_TTL_MS,
    value
  });

  return value;
}

function getAuthorizationCacheKey(context: ServiceContext) {
  const authorization = context.authorization?.trim();
  return authorization ? authorization : '';
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

export async function getCurrentUser(context: ServiceContext): Promise<CurrentUserResult> {
  const cacheKey = getAuthorizationCacheKey(context);
  const loadCurrentUser = async () => {
    const client = createSupabaseClient('user', context);
    const {
      data: { user },
      error
    } = await client.auth.getUser().catch((error: unknown) => {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `Authentication service unavailable: ${error.message}`
          : 'Authentication service unavailable.'
      );
    });

    if (error || !user) {
      throw new UnauthorizedException('Authentication required.');
    }

    return { client, user };
  };

  return cacheKey
    ? readCachedPromise(currentUserCache, cacheKey, loadCurrentUser)
    : loadCurrentUser();
}

export async function getUserAuthorization(
  client: SupabaseClient,
  userId: string,
  options: UserAuthorizationOptions = {}
): Promise<UserAuthorization> {
  const cacheKey = userId.trim();
  if (options.refresh && cacheKey) {
    userAuthorizationCache.delete(cacheKey);
  }

  if (cacheKey) {
    return readCachedPromise(userAuthorizationCache, cacheKey, () =>
      loadUserAuthorization(client, userId)
    );
  }

  return loadUserAuthorization(client, userId);
}

async function loadUserAuthorization(
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

  const profileRecord = (profile as Record<string, unknown> | null) ?? null;
  const isLegacyAdmin = isLegacyAdminProfile(profileRecord);
  const rpcPermissionCodes = normalizeStringArray(permissionsResult.data);
  const databasePermissionCodes = rpcPermissionCodes.length
    ? []
    : await readPermissionCodesFromSupabase(client, userId);
  const legacyAdminPermissionCodes = isLegacyAdmin
    ? await readLegacyAdminPermissionCodes(client)
    : [];

  return {
    profile: profileRecord,
    permissionCodes: uniqueStrings([
      ...rpcPermissionCodes,
      ...databasePermissionCodes,
      ...legacyAdminPermissionCodes
    ]),
    accounts: normalizeAccounts(accountsResult.data),
    isLegacyAdmin
  };
}

export function hasRequiredPermission(
  authorization: Pick<UserAuthorization, 'permissionCodes'> & Partial<Pick<UserAuthorization, 'isLegacyAdmin'>>,
  requiredPermissions?: string | string[]
) {
  const required = normalizeRequiredPermissions(requiredPermissions);

  if (authorization.isLegacyAdmin) {
    return true;
  }

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
