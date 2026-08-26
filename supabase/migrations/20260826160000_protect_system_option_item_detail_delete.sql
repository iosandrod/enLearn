-- Allow option-item detail deletes while preserving the system-row guard inside
-- the same dynamic CRUD transaction.

create or replace function public.dynamic_crud_prevent_system_row_delete(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
begin
  if coalesce((payload->>'is_system')::boolean, false) then
    raise exception '%', coalesce(
      nullif(args->>'message', ''),
      'System records cannot be deleted.'
    ) using errcode = '42501';
  end if;

  return payload;
end;
$function$;

revoke all on function public.dynamic_crud_prevent_system_row_delete(jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.dynamic_crud_prevent_system_row_delete(jsonb, jsonb, jsonb)
  to authenticated, service_role;
