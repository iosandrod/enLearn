export type AppAuthUser = {
  id: string;
  email?: string;
  phone?: string;
  role?: string;
  aud?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type AppAuthSession = {
  expiresAt: number | null;
};

export type AppAccountSummary = {
  account_id: string;
  account_role: 'owner' | 'member';
  is_primary_owner: boolean;
  name: string | null;
  slug: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  code?: string | null;
  status?: 'active' | 'inactive' | 'archived' | null;
  base_currency?: string | null;
  timezone?: string | null;
  fiscal_year_start_month?: number | null;
  is_default?: boolean;
  is_last_used?: boolean;
  last_login_at?: string | null;
};

export type AppAuthPayload = {
  user: AppAuthUser | null;
  profile: Record<string, unknown> | null;
  permissions: string[];
  accounts: AppAccountSummary[];
  activeAccount?: AppAccountSummary | null;
  accountRequired?: boolean;
  session: AppAuthSession | null;
};

export function useAuthState() {
  const user = useState<AppAuthUser | null>('auth-user', () => null);
  const profile = useState<Record<string, unknown> | null>('auth-profile', () => null);
  const permissions = useState<string[]>('auth-permissions', () => []);
  const accounts = useState<AppAccountSummary[]>('auth-accounts', () => []);
  const activeAccount = useState<AppAccountSummary | null>('auth-active-account', () => null);
  const accountRequired = useState('auth-account-required', () => false);
  const accountEpoch = useState('auth-account-epoch', () => 0);
  const session = useState<AppAuthSession | null>('auth-session', () => null);
  const ready = useState('auth-ready', () => false);

  return {
    user,
    profile,
    permissions,
    accounts,
    activeAccount,
    accountRequired,
    accountEpoch,
    session,
    ready
  };
}
