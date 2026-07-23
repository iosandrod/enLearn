export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireUser(event);
  const id = Number(getRouterParam(event, 'id'));

  if (!Number.isFinite(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid post id is required'
    });
  }

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    });
  }

  return { success: true };
});
