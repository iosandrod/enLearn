-- Keep the print-designer preview button on the database-backed Node Action path.
do $migration$
declare
  preview_script text := $script$async function main() {
  return await this.executeAction({ node: 'label-designer-canvas', method: 'preview' });
}$script$;
begin
  update public.lowcode_pages as page
  set
    schema = jsonb_set(
      page.schema,
      '{blocks}',
      coalesce((
        select jsonb_agg(
          case
            when block.value ->> 'id' = 'label-designer-actions' then jsonb_set(
              block.value,
              '{actions}',
              coalesce((
                select jsonb_agg(
                  case
                    when action.value ->> 'code' = 'label-preview' then jsonb_set(
                      action.value,
                      '{script}',
                      to_jsonb(preview_script)
                    )
                    else action.value
                  end
                  order by action.ordinality
                )
                from jsonb_array_elements(block.value -> 'actions') with ordinality as action(value, ordinality)
              ), block.value -> 'actions')
            )
            else block.value
          end
          order by block.ordinality
        )
        from jsonb_array_elements(page.schema -> 'blocks') with ordinality as block(value, ordinality)
      ), page.schema -> 'blocks'), true),
    version = page.version + 1,
    updated_at = timezone('utc', now())
  where page.code = 'print-designer'
    and exists (
      select 1
      from jsonb_array_elements(page.schema -> 'blocks') as block(value)
      cross join lateral jsonb_array_elements(block.value -> 'actions') as action(value)
      where block.value ->> 'id' = 'label-designer-actions'
        and action.value ->> 'code' = 'label-preview'
        and action.value ->> 'script' is distinct from preview_script
    );
end
$migration$;

-- The material action is invoked by the Node Action above. Delegate to the
-- editor's real preview entry point so the same preview UI is used everywhere.
do $migration$
declare
  next_source text;
  start_pos integer;
  end_pos integer;
begin
  select source_text
    into next_source
  from public.lowcode_materials
  where material_kind = 'page'
    and code = 'label-designer'
  for update;

  if next_source is null then
    return;
  end if;

  start_pos := strpos(next_source, 'function preview() {');
  end_pos := strpos(next_source, 'function print() {');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $preview$
async function preview() {
  const instance = designer.value;
  if (typeof instance?.previewPrint === 'function') {
    await instance.previewPrint();
  } else {
    window.dispatchEvent(new CustomEvent('lowcode:print.preview', { detail: snapshot() }));
  }
  message.value = '已发起打印预览';
  return true;
}

$preview$ || substring(next_source from end_pos);
  end if;

  update public.lowcode_materials
  set
    source_text = next_source,
    source_hash = md5(next_source),
    material_version = '1.4.0',
    updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$migration$;
