-- The template editor is also rendered inside confirmLowCodePage. Keep the
-- dialog page focused on its form so the outer dialog has one authoritative
-- save action and does not navigate the host page from an inner toolbar.
update public.lowcode_pages as page
set
  schema = jsonb_set(
    page.schema,
    '{blocks}',
    coalesce((
      select jsonb_agg(
        case
          when block.value ->> 'kind' = 'form'
            and block.value ->> 'id' = 'print-templates-edit-form'
            then jsonb_set(block.value, '{schema,actions}', '[]'::jsonb)
          else block.value
        end
        order by block.ordinality
      )
      from jsonb_array_elements(page.schema -> 'blocks') with ordinality as block(value, ordinality)
      where block.value ->> 'kind' <> 'buttonGroup'
    ), '[]'::jsonb), true),
  version = page.version + 1,
  updated_at = timezone('utc', now())
where page.code = 'print-templates-edit'
  and exists (
    select 1
    from jsonb_array_elements(page.schema -> 'blocks') as block(value)
    where block.value ->> 'kind' = 'buttonGroup'
      or (
        block.value ->> 'kind' = 'form'
        and block.value ->> 'id' = 'print-templates-edit-form'
        and jsonb_array_length(coalesce(block.value #> '{schema,actions}', '[]'::jsonb)) > 0
      )
  );
