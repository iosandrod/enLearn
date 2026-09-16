-- Preserve configured toolbar button icons in the published page material.
do $migration$
declare
  old_line text := $toolbar_old$        :status="action.status"
$toolbar_old$;
  new_line text := $toolbar_new$        :status="action.status"
        :prefix-icon="action.prefixIcon ?? action.icon"
$toolbar_new$;
  updated_source text;
begin
  select source_text
  into updated_source
  from public.lowcode_materials
  where material_kind = 'page'
    and code = 'toolbar';

  if updated_source is null then
    raise exception 'toolbar material was not found';
  end if;

  if position(':prefix-icon="action.prefixIcon ?? action.icon"' in updated_source) = 0 then
    updated_source := replace(updated_source, old_line, new_line);
  end if;

  if position(':prefix-icon="action.prefixIcon ?? action.icon"' in updated_source) = 0 then
    raise exception 'toolbar material source has an unexpected shape';
  end if;

  update public.lowcode_materials
  set source_text = updated_source,
      source_hash = encode(
        digest(convert_to(updated_source, 'UTF8'), 'sha256'),
        'hex'
      ),
      material_version = '1.0.1',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'page'
    and code = 'toolbar';
end
$migration$;
