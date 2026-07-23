export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireUser(event);
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('public.posts')) {
      return [];
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message
    });
  }

  return data ?? [];
});
