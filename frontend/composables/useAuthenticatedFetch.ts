import { authenticatedFetchResponse } from '../src/spa-compat';

export function useAuthenticatedFetch() {
  async function request<T>(url: string, options: Parameters<typeof $fetch>[1] = {}) {
    return $fetch<T>(url, {
      ...options
    });
  }

  async function requestRaw(
    url: string,
    options: Parameters<typeof authenticatedFetchResponse>[1] = {}
  ) {
    return authenticatedFetchResponse(url, options);
  }

  return { request, requestRaw };
}
