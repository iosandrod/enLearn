-- Show both label and value in database-backed select materials.
-- The value binding remains unchanged; only the option's display label is formatted.
begin;

do $migration$
declare
  v_code text;
  v_source_text text;
  v_found integer := 0;
begin
  for v_code in
    select code
    from public.lowcode_materials
    where material_kind = 'form'
      and code in ('vxe-select', 'lc-option-select')
    for update
  loop
    v_found := v_found + 1;
    select source_text
      into v_source_text
    from public.lowcode_materials
    where material_kind = 'form'
      and code = v_code;

    -- Keep local bootstrap/replay safe.
    if position('formatOptionLabel(option)' in v_source_text) > 0 then
      continue;
    end if;

    if position(':label="option.label"' in v_source_text) = 0
       or position('</script>' in v_source_text) = 0 then
      raise exception 'Low-code form material % has an unsupported source format.', v_code;
    end if;

    v_source_text := replace(
      v_source_text,
      ':label="option.label"',
      ':label="formatOptionLabel(option)"'
    );

    v_source_text := replace(
      v_source_text,
      E'\n</script>',
      $source$

function formatOptionPart(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatOptionLabel(option: { label?: unknown; value?: unknown }) {
  const label = formatOptionPart(option.label);
  const value = formatOptionPart(option.value);
  if (!label) return value;
  if (!value || label === value) return label;
  return `${label} (${value})`;
}
</script>$source$
    );

    update public.lowcode_materials
    set
      source_text = v_source_text,
      source_hash = md5(v_source_text),
      material_version = '1.1.0',
      updated_at = timezone('utc'::text, now())
    where material_kind = 'form'
      and code = v_code;
  end loop;

  if v_found = 0 then
    raise exception 'Low-code form material vxe-select does not exist.';
  end if;
end
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;
