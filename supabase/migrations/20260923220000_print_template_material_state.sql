-- Keep the active print-template record in the label-designer material so
-- switching templates never needs to mutate the outer page route.
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

  if next_source is null then
    return;
  end if;

  if position('const templateId = ref' in next_source) = 0 then
    next_source := replace(
      next_source,
      $old$const templateName = ref('新建模板');$old$,
      $new$const templateName = ref('新建模板');
const templateId = ref('');
const templateVersion = ref(1);$new$
    );
  end if;

  start_pos := strpos(next_source, 'async function loadData(');
  end_pos := strpos(next_source, 'async function save(');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $load$
async function loadData(options: Record<string, any> = {}) {
  const api = host.getServiceApi();
  const routeId = host.getRoute().query?.templateId;
  const nestedOptions = options && typeof options.options === 'object' ? options.options : {};
  const requestedId = String(options.templateId ?? nestedOptions.templateId ?? routeId ?? props.block.templateId ?? '').trim();
  if (!requestedId) return snapshot();
  const rows = await api.invoke<any[]>('admin', 'listItems', {
    resource: 'print_templates',
    filters: { id: requestedId },
    limit: 1,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('未找到指定的打印模板。');
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '新建模板';
  const version = Number.isInteger(row.version) && row.version > 0 ? row.version : 1;
  templateId.value = String(row.id || requestedId).trim();
  templateName.value = name;
  templateVersion.value = version;
  templateStatus.value = `数据库模板 · v${version}`;
  templateDirty.value = false;
  emitTemplateInfo();
  message.value = `已加载模板“${name}”`;
  return setData({ content: row.content, workspace: row.workspace });
}

$load$ || substring(next_source from end_pos);
  end if;

  start_pos := strpos(next_source, 'async function save(');
  end_pos := strpos(next_source, 'async function resetData()');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $save$
async function save(options: Record<string, any> = {}) {
  if (options && options.savedRecord && typeof options.savedRecord === 'object') {
    const result = options.savedRecord;
    const savedId = String(result.id || templateId.value || '').trim();
    const savedName = typeof result.name === 'string' && result.name.trim()
      ? result.name.trim()
      : templateName.value;
    const savedVersion = Number.isInteger(result.version) && result.version > 0 ? result.version : templateVersion.value;
    templateId.value = savedId;
    templateName.value = savedName;
    templateVersion.value = savedVersion;
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
  const id = String(templateId.value || props.block.templateId || routeId || '').trim();
  const payload: Record<string, any> = {
    name: String(templateName.value || props.block.templateName || '标签打印模板'),
    content: data.content,
    workspace: data.workspace,
    status: 'active',
    version: templateVersion.value,
    metadata: { editor: 'tldraw-vue', source: 'lowcode-label-designer', schemaVersion: 1 },
  };
  const result = await api.invoke<any>('admin', 'saveItem', {
    resource: 'print_templates',
    ...(id ? { id } : {}),
    data: payload,
  });
  const savedId = String(result?.id || id || '').trim();
  const savedName = typeof result?.name === 'string' && result.name.trim()
    ? result.name.trim()
    : payload.name;
  const savedVersion = Number.isInteger(result?.version) && result.version > 0 ? result.version : payload.version;
  templateId.value = savedId;
  templateName.value = savedName;
  templateVersion.value = savedVersion;
  templateStatus.value = `数据库模板 · v${savedVersion}`;
  templateDirty.value = false;
  emitTemplateInfo();
  dirty.value = false;
  message.value = `模板“${savedName}”已保存`;
  return result;
}

$save$ || substring(next_source from end_pos);
  end if;

  next_source := replace(
    next_source,
    $old$templateName.value = '新建模板';
  templateStatus.value = '尚未保存';$old$,
    $new$templateId.value = '';
  templateName.value = '新建模板';
  templateVersion.value = 1;
  templateStatus.value = '尚未保存';$new$
  );

  if position('getTemplateInfo: () => ({' in next_source) = 0 then
    next_source := replace(
      next_source,
      $old$    getData: snapshot,$old$,
      $new$    getData: snapshot,
    getTemplateInfo: () => ({
      templateId: templateId.value,
      templateName: templateName.value,
      templateStatus: templateStatus.value,
      templateVersion: templateVersion.value,
    }),$new$
    );
  end if;

  update public.lowcode_materials
  set
    source_text = next_source,
    source_hash = md5(next_source),
    material_version = '1.5.0',
    updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$migration$;

-- Read the current record context from the material action instead of the
-- outer route, which remains stable while the canvas data changes.
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
  const info = await this.executeAction({ node: 'label-designer-canvas', method: 'getTemplateInfo' });
  const templateId = String(info?.templateId || '').trim();
  const templateName = String(info?.templateName || '标签打印模板').trim();
  const templateStatus = String(info?.templateStatus || 'active').trim();
  const templateVersion = Number(info?.templateVersion || 1);
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
    where action.value ->> 'code' = 'label-save'
  );
