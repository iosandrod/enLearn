import { createError } from 'h3';
import { getDocPage } from '~/server/utils/site-content';

export default defineEventHandler(async () => {
  const page = await getDocPage();

  if (!page) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Documentation page not found'
    });
  }

  return page;
});
