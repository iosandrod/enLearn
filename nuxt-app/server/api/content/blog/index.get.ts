import { getQuery } from 'h3';
import { getBlogSummaries } from '~/server/utils/site-content';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;

  return getBlogSummaries(limit);
});
