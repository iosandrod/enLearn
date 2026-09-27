create or replace function public.assign_signup_default_account(
  login_user_id uuid,
  preferred_account_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public, basejump
as $$
declare
  selected_account basejump.accounts%rowtype;
begin
  select accounts.*
  into selected_account
  from basejump.accounts accounts
  where accounts.personal_account = false
    and accounts.status = 'active'
  order by (accounts.id = preferred_account_id) desc, accounts.created_at asc
  limit 1;

  if selected_account.id is null then
    raise exception 'No active account set is available';
  end if;

  insert into basejump.account_user (account_id, user_id, account_role)
  values (selected_account.id, login_user_id, 'member'::basejump.account_role)
  on conflict (user_id, account_id) do nothing;

  insert into public.account_user_preferences (
    user_id, default_account_id, last_account_id, last_login_at, updated_at
  ) values (
    login_user_id, selected_account.id, selected_account.id,
    timezone('utc'::text, now()), timezone('utc'::text, now())
  )
  on conflict (user_id) do update set
    default_account_id = excluded.default_account_id,
    last_account_id = excluded.last_account_id,
    updated_at = excluded.updated_at;

  return json_build_object(
    'account_id', selected_account.id,
    'account_role', 'member',
    'is_primary_owner', selected_account.primary_owner_user_id = login_user_id,
    'name', selected_account.name,
    'slug', selected_account.slug,
    'code', selected_account.code,
    'status', selected_account.status,
    'base_currency', selected_account.base_currency,
    'timezone', selected_account.timezone,
    'fiscal_year_start_month', selected_account.fiscal_year_start_month,
    'is_default', true,
    'is_last_used', true
  );
end;
$$;

revoke all on function public.assign_signup_default_account(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.assign_signup_default_account(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
