-- Keep the database enum status separate from the human-readable header text.
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

  if position('const templateRecordStatus = ref' in next_source) = 0 then
    next_source := replace(
      next_source,
      $old$const templateVersion = ref(1);$old$,
      $new$const templateVersion = ref(1);
const templateRecordStatus = ref('active');$new$
    );
  end if;

  next_source := replace(
    next_source,
    $old$templateVersion.value = version;
  templateStatus.value = `数据库模板 · v${version}`;$old$,
    $new$templateVersion.value = version;
  templateRecordStatus.value = ['draft', 'active', 'archived'].includes(row.status) ? row.status : 'active';
  templateStatus.value = `数据库模板 · v${version}`;$new$
  );

  next_source := replace(
    next_source,
    $old$const savedVersion = Number.isInteger(result.version) && result.version > 0 ? result.version : templateVersion.value;
    templateId.value = savedId;$old$,
    $new$const savedVersion = Number.isInteger(result.version) && result.version > 0 ? result.version : templateVersion.value;
    templateRecordStatus.value = ['draft', 'active', 'archived'].includes(result.status) ? result.status : templateRecordStatus.value;
    templateId.value = savedId;$new$
  );

  next_source := replace(
    next_source,
    $old$    status: 'active',
    version: templateVersion.value,$old$,
    $new$    status: templateRecordStatus.value,
    version: templateVersion.value,$new$
  );

  next_source := replace(
    next_source,
    $old$const savedVersion = Number.isInteger(result?.version) && result.version > 0 ? result.version : payload.version;
  templateId.value = savedId;$old$,
    $new$const savedVersion = Number.isInteger(result?.version) && result.version > 0 ? result.version : payload.version;
  templateRecordStatus.value = ['draft', 'active', 'archived'].includes(result?.status) ? result.status : templateRecordStatus.value;
  templateId.value = savedId;$new$
  );

  next_source := replace(
    next_source,
    $old$  templateVersion.value = 1;
  templateStatus.value = '尚未保存';$old$,
    $new$  templateVersion.value = 1;
  templateRecordStatus.value = 'active';
  templateStatus.value = '尚未保存';$new$
  );

  next_source := replace(
    next_source,
    $old$      templateVersion: templateVersion.value,
    }),$old$,
    $new$      templateVersion: templateVersion.value,
      templateRecordStatus: templateRecordStatus.value,
    }),$new$
  );

  update public.lowcode_materials
  set
    source_text = next_source,
    source_hash = md5(next_source),
    material_version = '1.6.0',
    updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$migration$;

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
                      $old_status$const templateStatus = String(info?.templateStatus || 'active').trim();$old_status$,
                      $new_status$const templateStatus = ['draft', 'active', 'archived'].includes(info?.templateRecordStatus) ? info.templateRecordStatus : 'active';$new_status$
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
      and action.value #>> '{script}' like '%info?.templateStatus%'
  );
