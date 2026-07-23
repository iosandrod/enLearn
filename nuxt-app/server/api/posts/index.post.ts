export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireUser(event);
  const body = await readBody<{ title?: string; content?: string | null }>(event);
  const title = body.title?.trim();

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Post title is required'
    });
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      title,
      content: body.content ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw createError({
      statusCode: error.code === 'PGRST205' ? 412 : 500,
      statusMessage: error.message
    });
  }

  return data;
});
