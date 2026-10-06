import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/common/utils/env';

const DEFAULT_EMAIL = '2@qq.com';
const DEFAULT_PASSWORD = '123456';

function requireValue(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`Missing ${name}.`);
}

async function main() {
  const env = getEnv();
  const supabaseUrl = requireValue(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_URL'
  );
  const anonKey = requireValue(
    env.SUPABASE_ANON_KEY ??
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'SUPABASE_ANON_KEY'
  );
  const email = process.env.PRINT_TEST_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.PRINT_TEST_PASSWORD ?? DEFAULT_PASSWORD;
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user || !signIn.data.session) {
    throw new Error(`Supabase sign-in failed: ${signIn.error?.message ?? 'No session returned.'}`);
  }

  console.log(`Signed in as ${signIn.data.user.email ?? signIn.data.user.id}.`);
  console.log(`Access token subject: ${signIn.data.user.id}`);

  const result = await supabase
    .from('print_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (result.error) {
    throw new Error(`print_templates query failed: ${result.error.message}`);
  }

  const rows = result.data ?? [];
  console.log(`Rows returned: ${rows.length}`);
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
