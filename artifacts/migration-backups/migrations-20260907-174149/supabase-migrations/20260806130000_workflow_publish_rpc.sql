-- Move workflow model publishing out of the Node pg client and behind a
-- single transactional Supabase RPC. The API calls this with the service role
-- and passes the already-authorized account/user context explicitly.

create or replace function public.publish_workflow_model(
  p_model_id uuid,
  p_account_id uuid,
  p_user_id uuid default null,
  p_remark text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_model public.wf_model%rowtype;
  v_version public.wf_model_version%rowtype;
  v_definition public.wf_process_definition%rowtype;
  v_schema jsonb;
  v_nodes jsonb;
  v_edges jsonb;
  v_node jsonb;
  v_edge jsonb;
  v_strategy jsonb;
  v_node_ids text[] := array[]::text[];
  v_fixed_user_ids uuid[] := array[]::uuid[];
  v_node_id text;
  v_node_type text;
  v_edge_id text;
  v_source text;
  v_target text;
  v_user_text text;
  v_start_count integer := 0;
  v_end_count integer := 0;
  v_missing_user_count integer := 0;
  v_version_number integer;
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  if p_model_id is null or p_account_id is null then
    raise exception 'modelId and accountId are required.' using errcode = '22023';
  end if;

  select *
  into v_model
  from public.wf_model
  where id = p_model_id
    and account_id = p_account_id
  for update;

  if not found then
    raise exception 'Workflow model not found.' using errcode = 'P0002';
  end if;

  v_schema := v_model.draft_schema;
  if v_schema is null or jsonb_typeof(v_schema) <> 'object' then
    raise exception 'Workflow schema must be an object.' using errcode = '22023';
  end if;
  if nullif(btrim(v_schema->>'code'), '') is null then
    raise exception 'Workflow schema code is required.' using errcode = '22023';
  end if;
  if nullif(btrim(v_schema->>'name'), '') is null then
    raise exception 'Workflow schema name is required.' using errcode = '22023';
  end if;

  v_nodes := coalesce(v_schema->'nodes', '[]'::jsonb);
  v_edges := coalesce(v_schema->'edges', '[]'::jsonb);
  if jsonb_typeof(v_nodes) <> 'array' or jsonb_array_length(v_nodes) = 0 then
    raise exception 'Workflow schema requires nodes.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_edges) <> 'array' or jsonb_array_length(v_edges) = 0 then
    raise exception 'Workflow schema requires edges.' using errcode = '22023';
  end if;

  for v_node in select value from jsonb_array_elements(v_nodes)
  loop
    if jsonb_typeof(v_node) <> 'object' then
      raise exception 'Every workflow node must be an object.' using errcode = '22023';
    end if;
    v_node_id := nullif(btrim(v_node->>'id'), '');
    v_node_type := nullif(btrim(v_node->>'type'), '');
    if v_node_id is null then
      raise exception 'Workflow node requires id.' using errcode = '22023';
    end if;
    if v_node_type is null then
      raise exception 'Workflow node % requires type.', v_node_id using errcode = '22023';
    end if;
    if v_node_id = any(v_node_ids) then
      raise exception 'Duplicate node id "%".', v_node_id using errcode = '22023';
    end if;

    v_node_ids := array_append(v_node_ids, v_node_id);
    if v_node_type = 'start' then v_start_count := v_start_count + 1; end if;
    if v_node_type = 'end' then v_end_count := v_end_count + 1; end if;

    if v_node_type in ('approval', 'sign', 'orSign') and
       coalesce(jsonb_typeof(v_node->'config'->'assigneeStrategy'), '') <> 'object' then
      raise exception '% node "%" requires assigneeStrategy.', v_node_type, v_node_id
        using errcode = '22023';
    end if;

    v_strategy := v_node->'config'->'assigneeStrategy';
    if v_strategy->>'type' = 'users'
       and jsonb_typeof(v_strategy->'userIds') = 'array' then
      for v_user_text in select value from jsonb_array_elements_text(v_strategy->'userIds')
      loop
        v_user_text := nullif(btrim(v_user_text), '');
        if v_user_text is null then
          continue;
        end if;
        if v_user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          raise exception 'Fixed workflow users and account set must use valid UUIDs.'
            using errcode = '22023';
        end if;
        if not (v_user_text::uuid = any(v_fixed_user_ids)) then
          v_fixed_user_ids := array_append(v_fixed_user_ids, v_user_text::uuid);
        end if;
      end loop;
    end if;
  end loop;

  if v_start_count <> 1 then
    raise exception 'Workflow schema must contain exactly one start node.' using errcode = '22023';
  end if;
  if v_end_count < 1 then
    raise exception 'Workflow schema must contain at least one end node.' using errcode = '22023';
  end if;

  for v_edge in select value from jsonb_array_elements(v_edges)
  loop
    if jsonb_typeof(v_edge) <> 'object' then
      raise exception 'Every workflow edge must be an object.' using errcode = '22023';
    end if;
    v_source := nullif(btrim(v_edge->>'source'), '');
    v_target := nullif(btrim(v_edge->>'target'), '');
    if v_source is null or not (v_source = any(v_node_ids)) then
      raise exception 'Edge source "%" does not exist.', coalesce(v_source, '')
        using errcode = '22023';
    end if;
    if v_target is null or not (v_target = any(v_node_ids)) then
      raise exception 'Edge target "%" does not exist.', coalesce(v_target, '')
        using errcode = '22023';
    end if;
  end loop;

  if coalesce(array_length(v_fixed_user_ids, 1), 0) > 0 then
    select count(*)::integer
    into v_missing_user_count
    from unnest(v_fixed_user_ids) as fixed_users(user_id)
    where not exists (
      select 1
      from basejump.account_user memberships
      join basejump.accounts accounts on accounts.id = memberships.account_id
      where memberships.account_id = p_account_id
        and memberships.user_id = fixed_users.user_id
        and accounts.status = 'active'
    );

    if v_missing_user_count > 0 then
      raise exception 'Every fixed workflow user must belong to the active account set.'
        using errcode = '22023';
    end if;
  end if;

  v_version_number := coalesce(v_model.current_version, 0) + 1;

  insert into public.wf_model_version (
    id,
    model_id,
    version,
    schema,
    remark,
    created_by,
    created_at
  ) values (
    gen_random_uuid(),
    v_model.id,
    v_version_number,
    v_schema,
    nullif(btrim(coalesce(p_remark, '')), ''),
    p_user_id,
    v_now
  )
  returning * into v_version;

  insert into public.wf_process_definition (
    id,
    account_id,
    model_id,
    model_version_id,
    code,
    name,
    version,
    document_type,
    schema,
    status,
    published_by,
    published_at
  ) values (
    gen_random_uuid(),
    v_model.account_id,
    v_model.id,
    v_version.id,
    v_model.code,
    v_model.name,
    v_version_number,
    v_model.document_type,
    v_schema,
    'active',
    p_user_id,
    v_now
  )
  returning * into v_definition;

  for v_node in select value from jsonb_array_elements(v_nodes)
  loop
    v_node_id := nullif(btrim(v_node->>'id'), '');
    v_node_type := nullif(btrim(v_node->>'type'), '');
    insert into public.wf_node_definition (
      definition_id,
      node_id,
      node_type,
      name,
      config
    ) values (
      v_definition.id,
      v_node_id,
      v_node_type,
      coalesce(nullif(btrim(v_node->>'name'), ''), v_node_type),
      case when jsonb_typeof(v_node->'config') = 'object' then v_node->'config' else '{}'::jsonb end
    )
    on conflict (definition_id, node_id) do update set
      node_type = excluded.node_type,
      name = excluded.name,
      config = excluded.config;
  end loop;

  for v_edge in select value from jsonb_array_elements(v_edges)
  loop
    v_edge_id := nullif(btrim(v_edge->>'id'), '');
    v_source := nullif(btrim(v_edge->>'source'), '');
    v_target := nullif(btrim(v_edge->>'target'), '');
    insert into public.wf_edge_definition (
      definition_id,
      edge_id,
      source_node_id,
      target_node_id,
      condition,
      priority
    ) values (
      v_definition.id,
      coalesce(v_edge_id, v_source || '->' || v_target),
      v_source,
      v_target,
      case when jsonb_typeof(v_edge->'condition') = 'object' then v_edge->'condition' else null end,
      case when jsonb_typeof(v_edge->'priority') = 'number' then (v_edge->>'priority')::integer else null end
    )
    on conflict (definition_id, edge_id) do update set
      source_node_id = excluded.source_node_id,
      target_node_id = excluded.target_node_id,
      condition = excluded.condition,
      priority = excluded.priority;
  end loop;

  update public.wf_model
  set status = 'published',
      current_version = v_version_number,
      updated_by = p_user_id,
      updated_at = v_now
  where id = v_model.id
  returning * into v_model;

  return jsonb_build_object(
    'model', to_jsonb(v_model),
    'version', to_jsonb(v_version),
    'definition', to_jsonb(v_definition)
  );
end;
$function$;

revoke all on function public.publish_workflow_model(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_workflow_model(uuid, uuid, uuid, text)
  to service_role;
