import { invokeBackendService } from '../../utils/backend';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: string; content?: string | null }>(event);
  const title = body.title?.trim();

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Post title is required'
    });
  }

  return invokeBackendService(event, 'posts', 'create', {
    title,
    content: body.content ?? null
  });
});
