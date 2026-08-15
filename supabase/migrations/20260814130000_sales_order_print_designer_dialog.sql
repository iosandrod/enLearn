-- Open the existing print designer from the sales-order print button.

create or replace function pg_temp.upsert_lowcode_block_action(
  p_document jsonb,
  p_block_id text,
  p_action_code text,
  p_action jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_actions jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_block_id then
        v_actions := coalesce(p_document -> 'actions', '[]'::jsonb);
        if jsonb_typeof(v_actions) <> 'array' then
          v_actions := '[]'::jsonb;
        end if;

        if exists (
          select 1
          from jsonb_array_elements(v_actions) action
          where action ->> 'code' = p_action_code
        ) then
          select jsonb_agg(
            case
              when action.value ->> 'code' = p_action_code
                then action.value || p_action
              else action.value
            end
            order by action.ordinality
          )
          into v_actions
          from jsonb_array_elements(v_actions) with ordinality action(value, ordinality);
        else
          v_actions := v_actions || jsonb_build_array(p_action);
        end if;

        return jsonb_set(p_document, '{actions}', v_actions, true);
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.upsert_lowcode_block_action(
          entry.value,
          p_block_id,
          p_action_code,
          p_action
        )
      )
      into v_result
      from jsonb_each(p_document) entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.upsert_lowcode_block_action(
          item.value,
          p_block_id,
          p_action_code,
          p_action
        )
        order by item.ordinality
      )
      into v_result
      from jsonb_array_elements(p_document) with ordinality item(value, ordinality);
      return coalesce(v_result, '[]'::jsonb);

    else
      return p_document;
  end case;
end;
$function$;

do $$
declare
  v_page_id uuid;
  v_current_version integer;
  v_current_schema jsonb;
  v_next_schema jsonb;
  v_script_policy jsonb;
  v_api_names jsonb;
  v_capabilities jsonb;
  v_next_version integer;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'sales-orders'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page sales-orders does not exist.';
  end if;

  v_next_schema := pg_temp.upsert_lowcode_block_action(
    v_current_schema,
    'sales-order-actions',
    'print',
    jsonb_build_object(
      'code', 'print',
      'label', '打印',
      'type', 'button',
      'mode', 'button',
      'icon', 'ri-printer-line',
      'script', $script$
const grid = this.grids["sales-order-grid"] || {};
const selectedRows = Array.isArray(grid.selectedRows) ? grid.selectedRows : [];
const order = grid.currentRow || selectedRows[0] || null;
return this.$api.invoke("print.designer.open", { order });
$script$
    )
  );

  v_script_policy := case
    when jsonb_typeof(v_next_schema -> 'scriptPolicy') = 'object'
      then v_next_schema -> 'scriptPolicy'
    else '{}'::jsonb
  end;
  v_api_names := case
    when jsonb_typeof(v_script_policy -> 'apiNames') = 'array'
      then v_script_policy -> 'apiNames'
    else '[]'::jsonb
  end;
  if not v_api_names @> '["print.designer.open"]'::jsonb then
    v_api_names := v_api_names || '["print.designer.open"]'::jsonb;
  end if;
  v_capabilities := case
    when jsonb_typeof(v_script_policy -> 'capabilities') = 'array'
      then v_script_policy -> 'capabilities'
    else '[]'::jsonb
  end;
  if not v_capabilities @> '["api.invoke"]'::jsonb then
    v_capabilities := v_capabilities || '["api.invoke"]'::jsonb;
  end if;
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy}',
    v_script_policy || jsonb_build_object(
      'apiNames', v_api_names,
      'capabilities', v_capabilities
    ),
    true
  );

  if v_next_schema = v_current_schema then
    return;
  end if;

  v_next_version := v_current_version + 1;
  update public.lowcode_pages
  set schema = v_next_schema,
      version = v_next_version,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_next_version, v_next_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;

select pg_notify('pgrst', 'reload schema');
