import {
  createClient,
  type Session,
  type User
} from '@supabase/supabase-js';

let appSupabaseClient: ReturnType<typeof createClient> | null = null;

export function useAppSupabase() {
  const config = useRuntimeConfig();

  if (!appSupabaseClient) {
    appSupabaseClient = createClient(
      config.public.supabaseUrl,
      config.public.supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: import.meta.client
        }
      }
    );
  }

  return appSupabaseClient;
}

export function useAuthState() {
  const user = useState<User | null>('auth-user', () => null);
  const session = useState<Session | null>('auth-session', () => null);
  const ready = useState('auth-ready', () => false);

  return { user, session, ready };
}
