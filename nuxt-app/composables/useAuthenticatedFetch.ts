export function useAuthenticatedFetch() {
  async function request<T>(url: string, options: Parameters<typeof $fetch>[1] = {}) {
    return $fetch<T>(url, {
      ...options
    });
  }

  return { request };
}
