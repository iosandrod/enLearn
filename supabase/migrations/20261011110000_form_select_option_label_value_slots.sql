-- Render dropdown option text through slots; keep labels and submitted values intact.
do $$
declare
  material record;
  option_source text;
  updated_source text;
begin
  for material in
    select id, code, source_text
    from public.lowcode_materials
    where material_kind = 'form'
      and code in ('vxe-select', 'lc-option-select', 'lc-array-table')
    for update
  loop
    updated_source := material.source_text;
    for option_source in
      select matches[1]
      from regexp_matches(
        material.source_text,
        '(<vxe-option\s+[^>]*:label="option[.]label"[^>]*/>)',
        'g'
      ) as matches
    loop
      updated_source := replace(
        updated_source,
        option_source,
        regexp_replace(
          option_source,
          '([ \t]*)/>$',
          E'>\n\\1  <template #default>{{ option.label }}({{ option.value }})</template>\n\\1</vxe-option>'
        )
      );
    end loop;

    if updated_source not like '%<template #default>{{ option.label }}({{ option.value }})</template>%' then
      raise exception 'Dropdown option slot could not be applied to material %', material.code;
    end if;

    if updated_source is distinct from material.source_text then
      update public.lowcode_materials
      set source_text = updated_source,
          source_hash = encode(sha256(convert_to(updated_source, 'UTF8')), 'hex'),
          updated_at = timezone('utc'::text, now())
      where id = material.id;
    end if;
  end loop;
end
$$;
