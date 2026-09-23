-- Route print-designer saves through the template-management low-code edit page.
do $migration$
declare
  next_source text;
  start_pos integer;
  end_pos integer;
begin
  select source_text
    into next_source
  from public.lowcode_materials
  where material_kind = 'page'
    and code = 'label-designer'
  for update;

  if next_source is not null then
    start_pos := strpos(next_source, 'async function save');
    end_pos := strpos(next_source, 'async function resetData()');
    if start_pos > 0 and end_pos > start_pos then
      next_source := left(next_source, start_pos - 1) || $save$
async function save(options: Record<string, any> = {}) {
  if (options && options.savedRecord && typeof options.savedRecord === 'object') {
    const result = options.savedRecord;
    const savedName = typeof result.name === 'string' && result.name.trim()
      ? result.name.trim()
      : templateName.value;
    const savedVersion = Number.isInteger(result.version) && result.version > 0 ? result.version : 1;
    templateName.value = savedName;
    templateStatus.value = `数据库模板 · v${savedVersion}`;
    templateDirty.value = false;
    emitTemplateInfo();
    dirty.value = false;
    message.value = `模板“${savedName}”已保存`;
    return result;
  }

  const data = snapshot();
  if (!data.content?.shapes?.length) throw new Error('当前画布没有可保存内容。');
  const api = host.getServiceApi();
  const routeId = host.getRoute().query?.templateId;
  const id = String(props.block.templateId ?? routeId ?? '').trim();
  const payload: Record<string, any> = {
    name: String(props.block.templateName || '标签打印模板'),
    content: data.content,
    workspace: data.workspace,
    status: 'active',
    version: 1,
    metadata: { editor: 'tldraw-vue', source: 'lowcode-label-designer', schemaVersion: 1 },
  };
  const result = await api.invoke<any>('admin', 'saveItem', {
    resource: 'print_templates',
    ...(id ? { id } : {}),
    data: payload,
  });
  const savedName = typeof result?.name === 'string' && result.name.trim()
    ? result.name.trim()
    : payload.name;
  const savedVersion = Number.isInteger(result?.version) && result.version > 0 ? result.version : payload.version;
  templateName.value = savedName;
  templateStatus.value = `数据库模板 · v${savedVersion}`;
  templateDirty.value = false;
  emitTemplateInfo();
  dirty.value = false;
  message.value = `模板“${savedName}”已保存`;
  return result;
}

$save$ || substring(next_source from end_pos);
    end if;

    update public.lowcode_materials
    set
      source_text = next_source,
      source_hash = md5(next_source),
      material_version = '1.4.0',
      updated_at = timezone('utc', now())
    where material_kind = 'page'
      and code = 'label-designer'
      and source_text is distinct from next_source;
  end if;
end
$migration$;

-- The low-code button owns the dialog and submits the edit form. The material
-- save action is then used only to synchronize the canvas status from the
-- record returned by the form submission.
update public.lowcode_pages as page
set
  schema = jsonb_set(
    page.schema,
    '{blocks}',
    coalesce((
      select jsonb_agg(
        case
          when block.value ->> 'id' = 'label-designer-actions' then jsonb_set(
            block.value,
            '{actions}',
            coalesce((
              select jsonb_agg(
                case
                  when action.value ->> 'code' = 'label-new' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb($new_script$
async function main() {
  const result = await this.executeAction({ node: 'label-designer-canvas', method: 'resetData' });
  const query = { ...(this.route?.query || {}) };
  delete query.templateId;
  delete query.templateName;
  await this.$router.push({ query });
  return result;
}
$new_script$::text)
                  )
                  when action.value ->> 'code' = 'label-load' then jsonb_set(
                    action.value,
                    '{script}',
                    to_jsonb($load_script$
async function main() {
  const result = await this.executeFunction({
    name: 'confirmLowCodePage',
    args: {
      pageCode: 'print-templates',
      includeData: true,
      title: '加载打印模板',
      confirmLabel: '加载',
      cancelLabel: '取消',
      requireSelection: true,
      dialog: { id: 'print-template-picker-dialog' },
    },
  });
  if (!result || result.action !== 'confirm' || !result.row?.id) return result;
  await this.executeAction({
    node: 'label-designer-canvas',
    method: 'loadData',
    templateId: result.row.id,
  });
  await this.$router.push({
    query: { ...(this.route?.query || {}), templateId: result.row.id, templateName: result.row.name || '' },
  });
  return result.row;
}
$load_script$::text)
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
  const result = await this.executeFunction({
    name: 'confirmLowCodePage',
    args: {
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
    },
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
            ), block.value -> 'actions')
          )
          else block.value
        end
        order by block.ordinality
      )
      from jsonb_array_elements(page.schema -> 'blocks') with ordinality as block(value, ordinality)
    ), page.schema -> 'blocks')
  ),
  version = page.version + 1,
  updated_at = timezone('utc', now())
where page.code = 'print-designer';
