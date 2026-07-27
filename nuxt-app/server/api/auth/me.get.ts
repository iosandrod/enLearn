import {
  backendFetch,
  hasBackendAuth,
  toPublicAuthPayload,
  type BackendAuthPayload
} from '../../utils/backend';

export default defineEventHandler(async (event) => {
  if (!hasBackendAuth(event)) {
    return toPublicAuthPayload({});
  }

  const payload = await backendFetch<BackendAuthPayload>(event, '/auth/me');
  return toPublicAuthPayload(payload);
});
