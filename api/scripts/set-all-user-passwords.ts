import { createSupabaseClient } from '../src/common/utils/supabase';

const password = process.env.ALL_USER_PASSWORD ?? '123456';
const pageSize = 1000;

async function main() {
  const admin = createSupabaseClient('admin');
  let page = 1;
  let updated = 0;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw new Error(`Could not list users: ${error.message}`);

    for (const user of data.users) {
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
      if (updateError) {
        throw new Error(`Could not update user ${user.id}: ${updateError.message}`);
      }
      updated += 1;
    }

    if (data.users.length < pageSize) break;
    page += 1;
  }

  console.log(`Updated passwords for ${updated} users.`);
}

void main();
