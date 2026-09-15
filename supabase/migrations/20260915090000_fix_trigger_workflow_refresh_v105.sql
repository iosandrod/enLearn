-- Use concrete workflow tables for job refreshes. Workflow listItems does not
-- expose the legacy jobs/jobRuns itemType aliases.
do $migration$
declare
  current_source text;
  updated_source text;
begin
  select source_text
  into current_source
  from public.lowcode_materials
  where material_kind = 'page'
    and code = 'trigger-workflow-designer';

  if current_source is null then
    raise exception 'trigger-workflow-designer material was not found';
  end if;

  updated_source := replace(
    current_source,
    'itemType: ' || chr(39) || 'jobs' || chr(39),
    'tableName: ' || chr(39) || 'wf_job' || chr(39)
  );

  if position('invoke<any[]>(''workflow'', ''listItems'', { tableName: ''wf_job'' })' in updated_source) = 0 then
    raise exception 'trigger-workflow-designer refresh function has an unexpected shape';
  end if;

  update public.lowcode_materials
  set source_text = updated_source,
      source_hash = encode(
        digest(convert_to(updated_source, 'UTF8'), 'sha256'),
        'hex'
      ),
      material_version = '1.0.5',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page'
    and code = 'trigger-workflow-designer';

  if position('invoke<any[]>(''workflow'', ''listItems'', { tableName: ''wf_job'' })' in updated_source) = 0
     or position('itemType: ''jobs''' in updated_source) > 0
     or position('workflowJob.value = jobs.find((item) => item.code === model.value.code);' in updated_source) = 0 then
    raise exception 'trigger-workflow-designer refresh function was not repaired';
  end if;
end
$migration$;

update public.lowcode_pages as page
set schema = jsonb_set(
      page.schema,
      '{blocks}',
      (
        select jsonb_agg(
          case
            when block.value->>'kind' = 'trigger-workflow-designer'
              then jsonb_set(block.value, '{materialVersion}', '"1.0.5"'::jsonb, true)
            else block.value
          end
          order by block.ordinality
        )
        from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
          with ordinality as block(value, ordinality)
      )
    ),
    version = page.version + 1,
    updated_at = timezone('utc'::text, now())
where page.code = 'trigger-workflow-designer'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) as block(value)
    where block.value->>'kind' = 'trigger-workflow-designer'
      and block.value->>'materialVersion' is distinct from '1.0.5'
  );
