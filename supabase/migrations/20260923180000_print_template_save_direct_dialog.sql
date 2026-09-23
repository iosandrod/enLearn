-- Open the template edit dialog directly from the print-designer button.
-- Going through executeFunction starts a second script runtime and leaves the
-- button script waiting for that nested invocation before any dialog is shown.
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
                    to_jsonb($save_script$
async function main() {
  const data = await this.executeAction({ node: 'label-designer-canvas', method: 'getData' });
  if (!data?.content?.shapes?.length) throw new Error('当前画布没有可保存内容。');
  const templateId = String(this.route?.query?.templateId || '').trim();
  const templateName = String(this.route?.query?.templateName || '标签打印模板').trim();
  const result = await this.$dialog.confirmLowCodePage({
    pageCode: 'print-templates-edit',
    includeData: false,
    title: templateId ? '保存打印模板' : '新建打印模板',
    confirmLabel: '保存',
    cancelLabel: '取消',
    submitOnConfirm: true,
    disableFormAutoLoad: true,
    formInitialValues: {
      'print-templates-edit-form': {
        ...(templateId ? { id: templateId } : {}),
        name: templateName,
        status: 'active',
        version: 1,
        content: data.content,
        workspace: data.workspace,
        metadata: { editor: 'tldraw-vue', source: 'print-designer', schemaVersion: 1 },
      },
    },
    dialog: { id: 'print-template-save-dialog' },
  });
  if (!result || result.action !== 'confirm' || !result.savedRecord) return result;
  const saved = await this.executeAction({
    node: 'label-designer-canvas',
    method: 'save',
    savedRecord: result.savedRecord,
  });
  await this.$router.push({
    query: { ...(this.route?.query || {}), templateId: result.savedRecord.id, templateName: result.savedRecord.name || templateName },
  });
  return saved;
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
where page.code = 'print-designer';
