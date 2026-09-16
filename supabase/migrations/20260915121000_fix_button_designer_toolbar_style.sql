-- Force the button designer array-table toolbar to use regular button styling.
do $migration$
declare
  old_block text := $toolbar_old$        ...(buttonProps as VxeButtonProps),
        code,
$toolbar_old$;
  new_block text := $toolbar_new$        ...(buttonProps as VxeButtonProps),
        mode: buttonProps.mode ?? 'button',
        code,
$toolbar_new$;
  updated_source text;
begin
  select source_text
  into updated_source
  from public.lowcode_materials
  where material_kind = 'form'
    and code = 'lc-array-table';

  if updated_source is null then
    raise exception 'lc-array-table material was not found';
  end if;

  if position('mode: buttonProps.mode ?? ''button''' in updated_source) = 0 then
    updated_source := replace(updated_source, old_block, new_block);
  end if;

  if position('mode: buttonProps.mode ?? ''button''' in updated_source) = 0 then
    raise exception 'lc-array-table material source has an unexpected shape';
  end if;

  update public.lowcode_materials
  set source_text = updated_source,
      source_hash = encode(
        digest(convert_to(updated_source, 'UTF8'), 'sha256'),
        'hex'
      ),
      material_version = '1.2.1',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'form'
    and code = 'lc-array-table';
end
$migration$;
