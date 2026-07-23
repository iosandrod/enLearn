import type { AuthChangeEvent, Provider, Session } from '@supabase/supabase-js';

export function useAuth() {
  const supabase = useAppSupabase();
  const { user, session, ready } = useAuthState();

  async function init() {
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    user.value = data.session?.user ?? null;
    ready.value = true;

    supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
      session.value = nextSession;
      user.value = nextSession?.user ?? null;
      ready.value = true;
      }
    );
  }

  async function signInWithPassword(credentials: {
    email: string;
    password: string;
  }) {
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    await init();
  }

  async function signUp(credentials: { email: string; password: string }) {
    const { error } = await supabase.auth.signUp(credentials);
    if (error) throw error;
    await init();
  }

  async function signInWithOAuth(provider: Provider) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    user.value = null;
    session.value = null;
    await navigateTo('/signin');
  }

  return {
    user,
    session,
    ready,
    init,
    signInWithPassword,
    signUp,
    signInWithOAuth,
    signOut
  };
}
