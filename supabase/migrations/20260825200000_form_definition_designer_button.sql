-- Design and save the selected low-code form definition from the system form page.

create or replace function pg_temp.upsert_json_array_item(
  p_items jsonb,
  p_key text,
  p_value text,
  p_item jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_items jsonb := case
    when jsonb_typeof(p_items) = 'array' then p_items
    else '[]'::jsonb
  end;
  v_result jsonb;
begin
  if exists (
    select 1
    from jsonb_array_elements(v_items) item
    where item ->> p_key = p_value
  ) then
    select jsonb_agg(
      case
        when item.value ->> p_key = p_value then item.value || p_item
        else item.value
      end
      order by item.ordinality
    )
    into v_result
    from jsonb_array_elements(v_items) with ordinality item(value, ordinality);
    return coalesce(v_result, '[]'::jsonb);
  end if;

  return v_items || jsonb_build_array(p_item);
end;
$function$;

create or replace function pg_temp.configure_form_definition_designer_button(
  p_document jsonb,
  p_script text
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_props jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      v_result := p_document;

      if p_document ->> 'id' = 'vid_08134f84e5' then
        v_result := jsonb_set(
          v_result,
          '{actions}',
          pg_temp.upsert_json_array_item(
            v_result -> 'actions',
            'code',
            'button_1',
            jsonb_build_object(
              'code', 'button_1',
              'label', '设计表单',
              'type', 'button',
              'mode', 'button',
              'icon', 'ri-layout-grid-line',
              'script', p_script,
              'disabled', false
            )
          ),
          true
        );
      elsif p_document ->> 'componentKey' = 'lowcode-button-group'
        and p_document #>> '{props,blockId}' = 'vid_08134f84e5' then
        v_props := case
          when jsonb_typeof(v_result -> 'props') = 'object' then v_result -> 'props'
          else '{}'::jsonb
        end;
        v_props := jsonb_set(
          v_props,
          '{buttons}',
          pg_temp.upsert_json_array_item(
            v_props -> 'buttons',
            'code',
            'button_1',
            jsonb_build_object(
              'code', 'button_1',
              'label', '设计表单',
              'type', 'button',
              'icon', 'ri-layout-grid-line',
              'script', p_script,
              'disabled', false,
              'directivesJson', '[]',
              'children', '[]'::jsonb
            )
          ),
          true
        );
        v_result := jsonb_set(v_result, '{props}', v_props, true);
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.configure_form_definition_designer_button(entry.value, p_script)
      )
      into v_result
      from jsonb_each(v_result) entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.configure_form_definition_designer_button(item.value, p_script)
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
  v_next_version integer;
  v_script_policy jsonb;
  v_api_names jsonb;
  v_capabilities jsonb;
  v_context jsonb;
  v_script text := $script$
const grid = this.grids["vid_877ad5473e"] || {};
const selectedRows = Array.isArray(grid.selectedRows) ? grid.selectedRows : [];
const row = grid.currentRow || selectedRows[0] || null;
if (!row || typeof row.id !== "string" || !row.id) {
  await this.$message.warning("请先选择要设计的表单。");
  return null;
}

const result = await this.$api.invoke("form.definition.designer.open", { id: row.id });
if (!result || result.saved !== true) return result;

await this.$source.refresh("records");
await this.$message.success("表单配置已保存。");
return result;
$script$;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'form-definetion'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page form-definetion does not exist.';
  end if;

  v_next_schema := pg_temp.configure_form_definition_designer_button(
    v_current_schema,
    v_script
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
  if not v_api_names @> '["form.definition.designer.open"]'::jsonb then
    v_api_names := v_api_names || '["form.definition.designer.open"]'::jsonb;
  end if;

  v_capabilities := case
    when jsonb_typeof(v_script_policy -> 'capabilities') = 'array'
      then v_script_policy -> 'capabilities'
    else '[]'::jsonb
  end;
  if not v_capabilities @> '["api.invoke"]'::jsonb then
    v_capabilities := v_capabilities || '["api.invoke"]'::jsonb;
  end if;
  if not v_capabilities @> '["message.warning"]'::jsonb then
    v_capabilities := v_capabilities || '["message.warning"]'::jsonb;
  end if;
  if not v_capabilities @> '["message.success"]'::jsonb then
    v_capabilities := v_capabilities || '["message.success"]'::jsonb;
  end if;
  if not v_capabilities @> '["source.refresh"]'::jsonb then
    v_capabilities := v_capabilities || '["source.refresh"]'::jsonb;
  end if;

  v_context := case
    when jsonb_typeof(v_script_policy -> 'context') = 'object'
      then v_script_policy -> 'context'
    else '{}'::jsonb
  end;
  v_context := jsonb_set(
    v_context,
    '{gridBlockIds}',
    '["vid_877ad5473e"]'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy}',
    v_script_policy || jsonb_build_object(
      'apiNames', v_api_names,
      'capabilities', v_capabilities,
      'context', v_context
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
