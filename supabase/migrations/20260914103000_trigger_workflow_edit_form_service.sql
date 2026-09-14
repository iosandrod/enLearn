-- Persist workflow model edits through the workflow service.  The admin
-- generic table endpoint does not normalize camelCase draftSchema to the
-- wf_model draft_schema column, which leaves the saved canvas schema stale.
update public.lowcode_pages as page
set schema = jsonb_set(
  page.schema,
  '{blocks}',
  (
    select jsonb_agg(
      case
        when block.value->>'id' = 'edit-form'
          and block.value->>'kind' = 'form'
          and block.value ? 'dataSource'
        then jsonb_set(
          jsonb_set(block.value, '{dataSource,serviceName}', to_jsonb('workflow'::text)),
          '{dataSource,saveServiceName}',
          to_jsonb('workflow'::text)
        )
        else block.value
      end
      order by block.ordinality
    )
    from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
      with ordinality as block(value, ordinality)
  )
)
where page.code = 'workflow-model-management-edit'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) as block(value)
    where block.value->>'id' = 'edit-form'
      and block.value->'dataSource'->>'serviceName' = 'admin'
  );
