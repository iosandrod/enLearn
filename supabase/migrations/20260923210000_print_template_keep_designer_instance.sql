-- Template switching is handled by the label-designer material itself. Do not
-- navigate after load/new/save: changing the query route remounts the outer
-- low-code page and reloads the whole designer.
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
                  when action.value ->> 'code' = 'label-load' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb($load_script$
async function main() {
  const result = await this.$dialog.confirmLowCodePage({
    pageCode: 'print-templates',
    includeData: true,
    title: '加载打印模板',
    confirmLabel: '加载',
    cancelLabel: '取消',
    requireSelection: true,
    dialog: { id: 'print-template-picker-dialog' },
  });
  if (!result || result.action !== 'confirm' || !result.row?.id) return result;
  await this.executeAction({
    node: 'label-designer-canvas',
    method: 'loadData',
    templateId: result.row.id,
  });
  return result.row;
}
$load_script$::text)
                  )
                  when action.value ->> 'code' = 'label-new' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb($new_script$
async function main() {
  return await this.executeAction({
    node: 'label-designer-canvas',
    method: 'resetData',
  });
}
$new_script$::text)
                  )
                  when action.value ->> 'code' = 'label-save' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb($save_script$
async function main() {
  const data = await this.executeAction({ node: 'label-designer-canvas', method: 'getData' });
  if (!data?.content?.shapes?.length) throw new Error('当前画布没有可保存内容。');
  const templateId = String(this.route?.query?.templateId || '').trim();
  const templateName = String(this.route?.query?.templateName || '标签打印模板').trim();
  const templateStatus = String(this.route?.query?.templateStatus || 'active').trim();
  const templateVersion = Number(this.route?.query?.templateVersion || 1);
  const result = await this.$dialog.confirmLowCodePage({
    pageCode: 'print-templates-edit',
    includeData: false,
    title: templateId ? '保存打印模板' : '新建打印模板',
    confirmLabel: '保存',
    cancelLabel: '取消',
    submitOnConfirm: true,
    disablePageAutoLoad: true,
    disableFormAutoLoad: true,
    formInitialValues: {
      'print-templates-edit-form': {
        ...(templateId ? { id: templateId } : {}),
        name: templateName,
        status: templateStatus,
        version: templateVersion,
        content: data.content,
        workspace: data.workspace,
        metadata: { editor: 'tldraw-vue', source: 'print-designer', schemaVersion: 1 },
      },
    },
    dialog: { id: 'print-template-save-dialog' },
  });
  if (!result || result.action !== 'confirm' || !result.savedRecord) return result;
  return await this.executeAction({
    node: 'label-designer-canvas',
    method: 'save',
    savedRecord: result.savedRecord,
  });
}
$save_script$::text)
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
    where action.value ->> 'code' in ('label-load', 'label-new', 'label-save')
  );
