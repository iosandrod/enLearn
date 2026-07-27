import {
  backendFetch,
  setBackendSessionCookies,
  toPublicAuthPayload,
  type BackendAuthPayload
} from '../../utils/backend';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const payload = await backendFetch<BackendAuthPayload>(event, '/auth/signup', {
    method: 'POST',
    body
  });

  setBackendSessionCookies(event, payload.session);
  return toPublicAuthPayload(payload);
});
