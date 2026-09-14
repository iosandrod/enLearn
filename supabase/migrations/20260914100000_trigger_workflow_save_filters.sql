-- Ensure the database-backed Trigger workflow designer passes the current
-- workflow ID to the edit dialog instead of relying on route.query.id.
update public.lowcode_pages as page
set schema = jsonb_set(
  page.schema,
  '{blocks}',
  (
    select jsonb_agg(
      case
        when block.value->>'id' = 'trigger-workflow-toolbar' then
          jsonb_set(
            block.value,
            '{actions}',
            (
              select jsonb_agg(
                case
                  when action.value->>'code' = 'trigger-workflow-save'
                    and action.value->>'script' not like '%filters: schema.id ?%'
                  then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb(replace(
                      action.value->>'script',
                      E'  disableFormAutoLoad: true,\n  formInitialValues:',
                      E'  disableFormAutoLoad: true,\n  filters: schema.id ? { id: schema.id } : undefined,\n  formInitialValues:'
                    ))
                  )
                  else action.value
                end
                order by action.ordinality
              )
              from jsonb_array_elements(coalesce(block.value->'actions', '[]'::jsonb))
                with ordinality as action(value, ordinality)
            )
          )
        else block.value
      end
      order by block.ordinality
    )
    from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
      with ordinality as block(value, ordinality)
  )
)
where page.code = 'trigger-workflow-designer'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) as block(value)
    cross join lateral jsonb_array_elements(coalesce(block.value->'actions', '[]'::jsonb)) as action(value)
    where block.value->>'id' = 'trigger-workflow-toolbar'
      and action.value->>'code' = 'trigger-workflow-save'
      and action.value->>'script' not like '%filters: schema.id ?%'
  );
