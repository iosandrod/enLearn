export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireUser(event);
  const id = Number(getRouterParam(event, 'id'));
  const body = await readBody<{ title?: string; content?: string | null }>(event);
  const title = body.title?.trim();

  if (!Number.isFinite(id) || !title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid post id and title are required'
    });
  }

  const { data, error } = await supabase
    .from('posts')
    .update({
      title,
      content: body.content ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    });
  }

  return data;
});
