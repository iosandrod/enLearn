-- The template-save dialog is prefilled from the active print canvas. Do not
-- load the edit page's record data source over those supplied values.
update public.lowcode_pages as page
set
  schema = jsonb_set(
    page.schema,
    '{blocks}',
    (
      select jsonb_agg(
        case
          when block.value ->> 'kind' = 'buttonGroup' then jsonb_set(
            block.value,
            '{actions}',
            (
              select jsonb_agg(
                case
                  when action.value ->> 'code' = 'label-save' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb(replace(
                      action.value #>> '{script}',
                      'disableFormAutoLoad: true,',
                      E'disablePageAutoLoad: true,\n    disableFormAutoLoad: true,'
                    ))
                  )
                  else action.value
                end
                order by action.ordinality
              )
              from jsonb_array_elements(block.value -> 'actions') with ordinality as action(value, ordinality)
            )
          )
          else block.value
        end
        order by block.ordinality
      )
      from jsonb_array_elements(page.schema -> 'blocks') with ordinality as block(value, ordinality)
    )
  ),
  version = page.version + 1,
  updated_at = timezone('utc', now())
where page.code = 'print-designer'
  and exists (
    select 1
    from jsonb_array_elements(page.schema -> 'blocks') as block(value)
    cross join lateral jsonb_array_elements(block.value -> 'actions') as action(value)
    where action.value ->> 'code' = 'label-save'
      and action.value #>> '{script}' like '%disableFormAutoLoad: true,%'
      and action.value #>> '{script}' not like '%disablePageAutoLoad: true,%'
  );
