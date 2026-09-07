begin;

create or replace function public.planning_insert_route_operation(
  p_account_id uuid,
  p_target_id uuid,
  p_position text,
  p_operation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  target_row public.planning_operation;
  parent_row public.planning_operation;
  created_row public.planning_operation;
  sibling_row record;
  parent_id uuid;
  next_priority integer := 0;
  operation_data jsonb := coalesce(p_operation, '{}'::jsonb);
  affected_ids uuid[] := array[]::uuid[];
begin
  if p_position is null or p_position not in ('before', 'after', 'child') then
    raise exception 'position must be before, after, or child.' using errcode = '22023';
  end if;
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1
    from basejump.account_user membership
    where membership.account_id = p_account_id
      and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;

  select operation.* into target_row
  from public.planning_operation operation
  where operation.account_id = p_account_id
    and operation.id = p_target_id
  for update;
  if not found then
    raise exception 'Target operation not found.' using errcode = 'P0002';
  end if;

  if p_position = 'child' then
    if target_row.type not in ('routing', 'alternate', 'split') then
      raise exception 'Only a container operation can accept child operations.' using errcode = '23514';
    end if;
    parent_id := target_row.id;
    parent_row := target_row;
  else
    parent_id := target_row.owner_id;
    if parent_id is not null then
      select operation.* into parent_row
      from public.planning_operation operation
      where operation.account_id = p_account_id
        and operation.id = parent_id
      for update;
      if not found then
        raise exception 'Parent operation not found.' using errcode = 'P0002';
      end if;
    end if;
  end if;

  -- Lock the complete sibling set before deriving the new deterministic order.
  perform operation.id
  from public.planning_operation operation
  where operation.account_id = p_account_id
    and operation.owner_id is not distinct from parent_id
  for update;

  insert into public.planning_operation (
    account_id, name, type, description, category, subcategory,
    item_id, location_id, owner_id, priority, effective_start, effective_end,
    fence, posttime, sizeminimum, sizemultiple, sizemaximum, cost,
    duration, duration_per, search, available_id, batchwindow, source,
    created_by, updated_by
  ) values (
    p_account_id,
    nullif(btrim(operation_data->>'name'), ''),
    coalesce(nullif(btrim(operation_data->>'type'), ''), 'fixed_time'),
    nullif(operation_data->>'description', ''),
    nullif(operation_data->>'category', ''),
    nullif(operation_data->>'subcategory', ''),
    coalesce(
      nullif(operation_data->>'item_id', '')::uuid,
      target_row.item_id,
      case when parent_id is not null then parent_row.item_id end
    ),
    coalesce(nullif(operation_data->>'location_id', '')::uuid, target_row.location_id),
    parent_id,
    coalesce(target_row.priority, 10),
    nullif(operation_data->>'effective_start', '')::timestamptz,
    nullif(operation_data->>'effective_end', '')::timestamptz,
    nullif(operation_data->>'fence', '')::interval,
    nullif(operation_data->>'posttime', '')::interval,
    coalesce(nullif(operation_data->>'sizeminimum', '')::numeric, 1),
    nullif(operation_data->>'sizemultiple', '')::numeric,
    nullif(operation_data->>'sizemaximum', '')::numeric,
    nullif(operation_data->>'cost', '')::numeric,
    nullif(operation_data->>'duration', '')::interval,
    nullif(operation_data->>'duration_per', '')::interval,
    nullif(operation_data->>'search', ''),
    nullif(operation_data->>'available_id', '')::uuid,
    nullif(operation_data->>'batchwindow', '')::interval,
    nullif(operation_data->>'source', ''),
    auth.uid(),
    auth.uid()
  )
  returning * into created_row;

  if parent_id is not null then
    insert into public.planning_suboperation (
      account_id, operation_id, suboperation_id, priority,
      effective_start, effective_end, source, created_by, updated_by
    ) values (
      p_account_id,
      parent_id,
      created_row.id,
      created_row.priority,
      coalesce(created_row.effective_start, '1971-01-01T00:00:00Z'::timestamptz),
      coalesce(created_row.effective_end, '2030-12-31T00:00:00Z'::timestamptz),
      created_row.source,
      auth.uid(),
      auth.uid()
    );
  end if;

  for sibling_row in
    with existing as (
      select
        operation.id,
        row_number() over (
          order by coalesce(operation.priority, 0), operation.created_at, operation.id
        ) * 2 as sort_key
      from public.planning_operation operation
      where operation.account_id = p_account_id
        and operation.owner_id is not distinct from parent_id
        and operation.id <> created_row.id
    ), ordered as (
      select existing.id, existing.sort_key
      from existing
      union all
      select
        created_row.id,
        case
          when p_position = 'child' then coalesce((select max(sort_key) + 2 from existing), 2)
          when p_position = 'before' then coalesce((select sort_key - 1 from existing where id = target_row.id), 1)
          else coalesce((select sort_key + 1 from existing where id = target_row.id), 1)
        end
    )
    select ordered.id
    from ordered
    order by ordered.sort_key, ordered.id
  loop
    next_priority := next_priority + 10;
    update public.planning_operation
    set priority = next_priority,
        updated_by = coalesce(auth.uid(), updated_by)
    where account_id = p_account_id
      and id = sibling_row.id;
    update public.planning_suboperation
    set priority = next_priority,
        updated_by = coalesce(auth.uid(), updated_by)
    where account_id = p_account_id
      and operation_id = parent_id
      and suboperation_id = sibling_row.id;
    affected_ids := array_append(affected_ids, sibling_row.id);
  end loop;

  if p_position = 'before' then
    update public.planning_operation_dependency
    set operation_id = created_row.id,
        updated_by = coalesce(auth.uid(), updated_by)
    where account_id = p_account_id
      and operation_id = target_row.id;
    insert into public.planning_operation_dependency (
      account_id, operation_id, blockedby_id, created_by, updated_by
    ) values (
      p_account_id, target_row.id, created_row.id, auth.uid(), auth.uid()
    ) on conflict (account_id, operation_id, blockedby_id) do nothing;
  elsif p_position = 'after' then
    update public.planning_operation_dependency
    set blockedby_id = created_row.id,
        updated_by = coalesce(auth.uid(), updated_by)
    where account_id = p_account_id
      and blockedby_id = target_row.id;
    insert into public.planning_operation_dependency (
      account_id, operation_id, blockedby_id, created_by, updated_by
    ) values (
      p_account_id, created_row.id, target_row.id, auth.uid(), auth.uid()
    ) on conflict (account_id, operation_id, blockedby_id) do nothing;
  end if;

  select operation.* into created_row
  from public.planning_operation operation
  where operation.account_id = p_account_id
    and operation.id = created_row.id;

  return jsonb_build_object(
    'operation', to_jsonb(created_row),
    'affectedOperationIds', to_jsonb(affected_ids),
    'parentOperationId', parent_id
  );
end;
$function$;

revoke all on function public.planning_insert_route_operation(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.planning_insert_route_operation(uuid, uuid, text, jsonb) to authenticated, service_role;

commit;
