-- Route the system form designer button through the trusted page-function entry.

create or replace function pg_temp.update_form_definition_designer_script(
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
      select jsonb_object_agg(
        entry.key,
        pg_temp.update_form_definition_designer_script(entry.value, p_script)
      )
      into v_result
      from jsonb_each(p_document) entry;
      v_result := coalesce(v_result, '{}'::jsonb);

      if v_result ->> 'id' = 'vid_08134f84e5'
        and jsonb_typeof(v_result -> 'actions') = 'array' then
        v_result := jsonb_set(
          v_result,
          '{actions}',
          (
            select coalesce(
              jsonb_agg(
                case
                  when item.value ->> 'code' = 'button_1'
                    then jsonb_set(item.value, '{script}', to_jsonb(p_script), true)
                  else item.value
                end
                order by item.ordinality
              ),
              '[]'::jsonb
            )
            from jsonb_array_elements(v_result -> 'actions')
              with ordinality item(value, ordinality)
          ),
          true
        );
      elsif v_result ->> 'componentKey' = 'lowcode-button-group'
        and v_result #>> '{props,blockId}' = 'vid_08134f84e5' then
        v_props := case
          when jsonb_typeof(v_result -> 'props') = 'object' then v_result -> 'props'
          else '{}'::jsonb
        end;
        if jsonb_typeof(v_props -> 'buttons') = 'array' then
          v_props := jsonb_set(
            v_props,
            '{buttons}',
            (
              select coalesce(
                jsonb_agg(
                  case
                    when item.value ->> 'code' = 'button_1'
                      then jsonb_set(item.value, '{script}', to_jsonb(p_script), true)
                    else item.value
                  end
                  order by item.ordinality
                ),
                '[]'::jsonb
              )
              from jsonb_array_elements(v_props -> 'buttons')
                with ordinality item(value, ordinality)
            ),
            true
          );
          v_result := jsonb_set(v_result, '{props}', v_props, true);
        end if;
      end if;
      return v_result;

    when 'array' then
      select jsonb_agg(
        pg_temp.update_form_definition_designer_script(item.value, p_script)
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
  v_script text := $script$
const grid = this.grids["vid_877ad5473e"] || {};
const selectedRows = Array.isArray(grid.selectedRows) ? grid.selectedRows : [];
const row = grid.currentRow || selectedRows[0] || null;

return this.executeFunction({
  name: "designForm",
  args: { id: row && typeof row.id === "string" ? row.id : "" },
});
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

  v_next_schema := pg_temp.update_form_definition_designer_script(
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
  select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
  into v_api_names
  from jsonb_array_elements(v_api_names) with ordinality item(value, ordinality)
  where item.value #>> '{}' <> 'form.definition.designer.open';

  v_capabilities := case
    when jsonb_typeof(v_script_policy -> 'capabilities') = 'array'
      then v_script_policy -> 'capabilities'
    else '[]'::jsonb
  end;
  select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
  into v_capabilities
  from jsonb_array_elements(v_capabilities) with ordinality item(value, ordinality)
  where item.value #>> '{}' not in (
    'api.invoke',
    'message.warning',
    'message.success',
    'source.refresh'
  );
  if not v_capabilities @> '["pageFunction.execute"]'::jsonb then
    v_capabilities := v_capabilities || '["pageFunction.execute"]'::jsonb;
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
