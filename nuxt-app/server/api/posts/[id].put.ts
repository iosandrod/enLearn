import { invokeBackendService } from '../../utils/backend';

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody<{ title?: string; content?: string | null }>(event);
  const title = body.title?.trim();

  if (!Number.isFinite(id) || !title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid post id and title are required'
    });
  }

  return invokeBackendService(event, 'posts', 'update', {
    id,
    title,
    content: body.content ?? null
  });
});
