import { createError, getRouterParam } from 'h3';
import { getDocPage } from '~/server/utils/site-content';

export default defineEventHandler(async (event) => {
  const rawSlug = getRouterParam(event, 'slug') ?? '';
  const routeParts = rawSlug.split('/').filter(Boolean);
  const page = await getDocPage(routeParts);

  if (!page) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Documentation page not found'
    });
  }

  return page;
});
