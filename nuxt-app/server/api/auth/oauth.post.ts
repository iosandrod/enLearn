import { backendFetch } from '../../utils/backend';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  return backendFetch(event, '/auth/oauth', {
    method: 'POST',
    body
  });
});
