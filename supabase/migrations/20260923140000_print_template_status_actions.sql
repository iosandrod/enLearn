-- Complete the template-state updates in the database-backed designer
-- material. Function-boundary replacement keeps this migration independent
-- of the source file's CRLF/LF line endings.
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

  start_pos := strpos(next_source, 'async function loadData(');
  end_pos := strpos(next_source, 'async function save()');
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
  templateName.value = name;
  templateStatus.value = `数据库模板 · v${version}`;
  templateDirty.value = false;
  emitTemplateInfo();
  message.value = `已加载模板“${name}”`;
  return setData({ content: row.content, workspace: row.workspace });
}

$load$ || substring(next_source from end_pos);
  end if;

  start_pos := strpos(next_source, 'async function save()');
  end_pos := strpos(next_source, 'async function resetData()');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $save$
async function save() {
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

  start_pos := strpos(next_source, 'async function resetData()');
  end_pos := strpos(next_source, 'async function validate()');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $reset$
async function resetData() {
  const instance = await waitForEditor();
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  suppressDirty = true;
  try {
    instance.store.mergeRemoteChanges(() => instance.run(() => {
      if (shapeIds.length) instance.deleteShapes(shapeIds);
      instance.selectNone();
    }, { history: 'ignore', ignoreShapeLock: true }));
  } finally {
    suppressDirty = false;
  }
  templateName.value = '新建模板';
  templateStatus.value = '尚未保存';
  templateDirty.value = false;
  emitTemplateInfo();
  dirty.value = false;
  message.value = '已新建空白模板';
  return snapshot();
}

$reset$ || substring(next_source from end_pos);
  end if;

  start_pos := strpos(next_source, 'function handleReady()');
  end_pos := strpos(next_source, 'function markDirty()');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $ready$
function handleReady() {
  readyPromiseResolve?.();
  readyPromiseResolve = undefined;
  emitTemplateInfo();
  void loadData().catch((error) => { message.value = error instanceof Error ? error.message : '模板加载失败'; });
}

$ready$ || substring(next_source from end_pos);
  end if;

  start_pos := strpos(next_source, 'function markDirty()');
  end_pos := strpos(next_source, 'onMounted(() =>');
  if start_pos > 0 and end_pos > start_pos then
    next_source := left(next_source, start_pos - 1) || $dirty$
function markDirty() {
  if (suppressDirty || templateDirty.value) return;
  templateDirty.value = true;
  templateStatus.value = '有未保存修改';
  emitTemplateInfo();
  dirty.value = true;
}

$dirty$ || substring(next_source from end_pos);
  end if;

  update public.lowcode_materials
  set
    source_text = next_source,
    source_hash = md5(next_source),
    material_version = '1.3.0',
    updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$migration$;
