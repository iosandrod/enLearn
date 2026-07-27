import { invokeBackendService } from '../../utils/backend';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));

  if (!Number.isFinite(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid post id is required'
    });
  }

  return invokeBackendService(event, 'posts', 'delete', { id });
});
