-- Restore job-state hydration for the database-backed Trigger workflow designer.
do $migration$
declare
  old_refresh text := $old$async function refresh() {
  
}$old$;
  new_refresh text := $new$async function refresh() {
  const jobs = await host.getServiceApi().invoke<any[]>('workflow', 'listItems', { itemType: 'jobs' });
  workflowJob.value = jobs.find((item) => item.code === model.value.code);
  message.value = workflowJob.value ? `作业状态：${workflowJob.value.status}` : '当前流程尚未启用';
  return workflowJob.value;
}$new$;
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

  if position(
    'workflowJob.value = jobs.find((item) => item.code === model.value.code);'
    in current_source
  ) > 0 then
    updated_source := current_source;
  elsif position(old_refresh in current_source) > 0 then
    updated_source := replace(current_source, old_refresh, new_refresh);
  else
    raise exception 'trigger-workflow-designer refresh function has an unexpected shape';
  end if;

  update public.lowcode_materials
  set source_text = updated_source,
      source_hash = encode(
        digest(convert_to(updated_source, 'UTF8'), 'sha256'),
        'hex'
      ),
      material_version = '1.0.3',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page'
    and code = 'trigger-workflow-designer';

  if position(
    $needle$host.getServiceApi().invoke<any[]>('workflow', 'listItems', { itemType: 'jobs' })$needle$
    in updated_source
  ) = 0 then
    raise exception 'trigger-workflow-designer refresh function was not restored';
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
              then jsonb_set(block.value, '{materialVersion}', '"1.0.3"'::jsonb, true)
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
      and block.value->>'materialVersion' is distinct from '1.0.3'
  );
