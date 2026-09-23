-- Persist the latest print-template header state so the standalone header can
-- recover it even when it mounts after the material's first status event.
do $migration$
declare
  next_source text;
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

  if position('__ENLEARN_PRINT_TEMPLATE_INFO__' in next_source) = 0 then
    next_source := replace(
      next_source,
      $old$  window.dispatchEvent(new CustomEvent('enlearn:print-template-info-change', {$old$,
      $new$  (window as Window & { __ENLEARN_PRINT_TEMPLATE_INFO__?: { name: string; status: string; dirty: boolean } }).__ENLEARN_PRINT_TEMPLATE_INFO__ = {
    name: templateName.value,
    status: templateStatus.value,
    dirty: templateDirty.value,
  };
  window.dispatchEvent(new CustomEvent('enlearn:print-template-info-change', {$new$
    );
  end if;

  update public.lowcode_materials
  set
    source_text = next_source,
    source_hash = md5(next_source),
    material_version = '1.2.0',
    updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$migration$;
