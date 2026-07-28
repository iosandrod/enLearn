import { getBackendAuthorization, refreshBackendSession } from '../../utils/backend';

function getSocketBaseUrl() {
  const config = useRuntimeConfig();
  const apiBaseUrl = String(config.apiBaseUrl || 'http://localhost:3002/api').replace(/\/+$/, '');
  return apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;
}

export default defineEventHandler(async (event) => {
  let authorization = getBackendAuthorization(event);

  if (!authorization) {
    const refreshed = await refreshBackendSession(event);
    if (refreshed?.session?.access_token) {
      authorization = `Bearer ${refreshed.session.access_token}`;
    }
  }

  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required.'
    });
  }

  return {
    token,
    socketBaseUrl: getSocketBaseUrl()
  };
});

