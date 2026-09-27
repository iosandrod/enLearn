begin;

-- Open the selected print data source in its own low-code form so Header and
-- Detail (including lc-array-table inputs) are edited with the source schema.
update public.lowcode_pages as page
set
  schema = jsonb_set(
    page.schema,
    '{blocks}',
    (
      select jsonb_agg(
        case
          when block.value ->> 'id' = 'label-designer-actions' then
            jsonb_set(
              block.value,
              '{actions}',
              (
                select jsonb_agg(
                  case
                    when action.value ->> 'code' = 'label-excel' then
                      jsonb_set(
                        action.value,
                        '{script}',
                        to_jsonb($script$
async function main() {
  const templateInfo = await this.executeAction({
    node: 'label-designer-canvas',
    method: 'getTemplateInfo',
  });
  const workspace = templateInfo?.workspace && typeof templateInfo.workspace === 'object'
    ? templateInfo.workspace
    : {};
  const source = workspace.printDataSource;
  const formCode = source && typeof source === 'object' && typeof source.formCode === 'string'
    ? source.formCode.trim()
    : '';

  if (!source || typeof source !== 'object' || source.type === 'none' || !formCode) {
    await this.$message.warning('请先填写数据源');
    return null;
  }

  const rows = Array.isArray(source.rows) && source.rows[0] && typeof source.rows[0] === 'object'
    ? source.rows[0]
    : {};
  return await this.executeFunction({
    name: 'confirmForm',
    args: {
      formCode,
      title: '数据导入',
      confirmLabel: '确定',
      cancelLabel: '取消',
      formInitialValues: { [formCode]: rows },
      disableFormAutoLoad: true,
      dialog: { id: 'print-data-source-import-dialog' },
    },
  });
}
$script$::text),
                        true
                      )
                    else action.value
                  end
                  order by action.ordinality
                )
                from jsonb_array_elements(block.value -> 'actions') with ordinality action(value, ordinality)
              ),
              true
            )
          else block.value
        end
        order by block.ordinality
      )
      from jsonb_array_elements(page.schema -> 'blocks') with ordinality block(value)
    ),
    true
  ),
  version = page.version + 1,
  updated_at = timezone('utc', now())
where page.code = 'print-designer'
  and jsonb_typeof(page.schema -> 'blocks') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(page.schema -> 'blocks') block(value)
    where block.value ->> 'id' = 'label-designer-actions'
  );

commit;
