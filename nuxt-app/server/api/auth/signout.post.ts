import { backendFetch, clearBackendSessionCookies } from '../../utils/backend';

export default defineEventHandler(async (event) => {
  try {
    await backendFetch(event, '/auth/signout', {
      method: 'POST'
    });
  } finally {
    clearBackendSessionCookies(event);
  }

  return { success: true };
});
