-- Internal workflow definition write compatibility. Public workflow APIs use
-- BaseService CRUD; this function removes the remaining direct table writes
-- from DefinitionService and keeps legacy internal callers transactional.

create or replace function public.workflow_definition_command(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_account_id uuid := nullif(v_payload->>'account_id', '')::uuid;
  v_model_id uuid := nullif(v_payload->>'model_id', '')::uuid;
  v_definition_id uuid := nullif(v_payload->>'definition_id', '')::uuid;
  v_user_id uuid := nullif(v_payload->>'user_id', '')::uuid;
  v_model public.wf_model%rowtype;
  v_definition public.wf_process_definition%rowtype;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'workflow_definition_command payload must be an object.' using errcode = '22023';
  end if;

  if v_action = 'save_model' then
    if v_account_id is null then
      raise exception 'account_id is required.' using errcode = '22023';
    end if;
    if nullif(btrim(v_payload->>'code'), '') is null
       or nullif(btrim(v_payload->>'name'), '') is null
       or jsonb_typeof(v_payload->'draft_schema') <> 'object' then
      raise exception 'code, name, and draft_schema are required.' using errcode = '22023';
    end if;

    if v_model_id is not null then
      update public.wf_model
      set code = btrim(v_payload->>'code'),
          name = btrim(v_payload->>'name'),
          document_type = nullif(btrim(v_payload->>'document_type'), ''),
          draft_schema = v_payload->'draft_schema',
          updated_by = v_user_id,
          updated_at = timezone('utc'::text, now())
      where id = v_model_id and account_id = v_account_id
      returning * into v_model;
      if not found then
        raise exception 'Workflow model not found.' using errcode = 'P0002';
      end if;
    else
      insert into public.wf_model (
        account_id, code, name, document_type, draft_schema,
        status, current_version, created_by, updated_by
      ) values (
        v_account_id, btrim(v_payload->>'code'), btrim(v_payload->>'name'),
        nullif(btrim(v_payload->>'document_type'), ''), v_payload->'draft_schema',
        'draft', 0, v_user_id, v_user_id
      )
      on conflict (account_id, code) do update set
        name = excluded.name,
        document_type = excluded.document_type,
        draft_schema = excluded.draft_schema,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc'::text, now())
      returning * into v_model;
    end if;
    return to_jsonb(v_model);
  end if;

  if v_action = 'disable_definition' then
    if v_definition_id is null then
      raise exception 'definition_id is required.' using errcode = '22023';
    end if;
    update public.wf_process_definition
    set status = 'disabled'
    where id = v_definition_id
      and (v_account_id is null or account_id = v_account_id)
    returning * into v_definition;
    if not found then
      raise exception 'Workflow definition not found.' using errcode = 'P0002';
    end if;
    return to_jsonb(v_definition);
  end if;

  raise exception 'Unsupported workflow definition action: %.', coalesce(p_action, '') using errcode = '22023';
end;
$function$;

revoke all on function public.workflow_definition_command(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.workflow_definition_command(text, jsonb)
  to service_role;

