import { createError, getRouterParam } from 'h3';
import { getBlogPost } from '~/server/utils/site-content';

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');

  if (!slug) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Blog post not found'
    });
  }

  try {
    return await getBlogPost(slug);
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Blog post not found'
    });
  }
});
