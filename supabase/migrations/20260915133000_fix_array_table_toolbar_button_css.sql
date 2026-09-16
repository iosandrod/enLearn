-- Restore visible button styling for the array-table toolbar's native buttons.
do $migration$
declare
  marker text := $toolbar_marker$.lc-array-table__toolbar {
$toolbar_marker$;
  styles text := $toolbar_styles$
.lc-array-table__toolbar-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.lc-array-table__toolbar-buttons > button {
  box-sizing: border-box;
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 26px;
  transition: border-color .15s, background-color .15s, color .15s;
}

.lc-array-table__toolbar-buttons > button:hover:not(:disabled) {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.lc-array-table__toolbar-buttons > button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.lc-array-table__toolbar-buttons > button.is-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.lc-array-table__toolbar-buttons > button.is-primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
  color: #fff;
}

$toolbar_styles$;
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

  if position('.lc-array-table__toolbar-buttons > button {' in updated_source) = 0 then
    updated_source := replace(updated_source, marker, styles || marker);
  end if;

  if position('.lc-array-table__toolbar-buttons > button {' in updated_source) = 0 then
    raise exception 'lc-array-table toolbar style insertion failed';
  end if;

  update public.lowcode_materials
  set source_text = updated_source,
      source_hash = encode(
        digest(convert_to(updated_source, 'UTF8'), 'sha256'),
        'hex'
      ),
      material_version = '1.2.3',
      updated_at = timezone('utc'::text, now())
  where material_kind = 'form'
    and code = 'lc-array-table';
end
$migration$;
