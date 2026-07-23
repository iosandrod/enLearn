export function useAuthenticatedFetch() {
  const supabase = useAppSupabase();

  async function request<T>(url: string, options: Parameters<typeof $fetch>[1] = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return $fetch<T>(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }

  return { request };
}
