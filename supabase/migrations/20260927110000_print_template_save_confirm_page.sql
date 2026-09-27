begin;

update public.lowcode_pages page
set schema = jsonb_set(
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
                  when action.value ->> 'code' = 'label-save' then
                    jsonb_set(
                      action.value,
                      '{script}',
                      to_jsonb($save_script$
async function main() {
  const templateInfo = await this.executeAction({
    node: 'label-designer-canvas',
    method: 'getTemplateInfo',
  });
  if (!templateInfo?.content) throw new Error('模板内容尚未就绪，无法保存。');

  const workspace = templateInfo.workspace && typeof templateInfo.workspace === 'object'
    ? templateInfo.workspace
    : {};
  const pages = Array.isArray(templateInfo.pages) ? templateInfo.pages : [];
  const status = templateInfo.templateStatus === 'draft' ? 'draft' : 'active';
  const version = Number.isInteger(templateInfo.templateVersion) && templateInfo.templateVersion > 0
    ? templateInfo.templateVersion
    : 1;
  const result = await this.$dialog.confirmLowCodePage({
    pageCode: 'print-templates-edit',
    includeData: false,
    formInitialValues: {
      'print-templates-edit-form': {
        id: String(templateInfo.templateId || '').trim(),
        name: String(templateInfo.templateName || '打印模板'),
        status,
        version,
        content: templateInfo.content,
        metadata: {
          editor: 'tldraw-vue',
          schemaVersion: 2,
          source: 'print-designer',
          ...(templateInfo.templateName ? { templateName: templateInfo.templateName } : {}),
          ...(workspace.designerMode ? { designerMode: workspace.designerMode } : {}),
          ...(pages.length ? { pageCount: pages.length } : {}),
        },
      },
    },
    disableFormAutoLoad: true,
    disablePageAutoLoad: true,
    submitOnConfirm: true,
    title: '保存打印模板',
    confirmLabel: '保存',
    cancelLabel: '取消',
    dialog: {
      id: 'print-template-save-dialog',
    },
  });

  if (result.action === 'cancel' || result.action === 'close') return result;
  if (!result.savedRecord) throw new Error('模板编辑页未返回已保存的模板记录。');
  return result;
}
$save_script$::text),
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
    from jsonb_array_elements(page.schema -> 'blocks') with ordinality block(value, ordinality)
  ),
  true
)
where page.code = 'print-designer'
  and jsonb_typeof(page.schema -> 'blocks') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(page.schema -> 'blocks') block(value)
    where block.value ->> 'id' = 'label-designer-actions'
  );

commit;
