-- Keep the standalone print designer header in sync with the template actions
-- exposed by the database-backed label-designer material.
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

  next_source := replace(
    next_source,
    $old$const message = ref('');$old$,
    $new$const message = ref('');
const templateName = ref('新建模板');
const templateStatus = ref('尚未保存');
const templateDirty = ref(false);
let suppressDirty = false;

function emitTemplateInfo() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('enlearn:print-template-info-change', {
    detail: {
      name: templateName.value,
      status: templateStatus.value,
      dirty: templateDirty.value,
    },
  }));
}$new$
  );

  next_source := replace(
    next_source,
    $old$  message.value = `已加载模板“${row.name || requestedId}”`;
  return setData({ content: row.content, workspace: row.workspace });$old$,
    $new$  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : '新建模板';
  const version = Number.isInteger(row.version) && row.version > 0 ? row.version : 1;
  templateName.value = name;
  templateStatus.value = `数据库模板 · v${version}`;
  templateDirty.value = false;
  emitTemplateInfo();
  message.value = `已加载模板“${name}”`;
  return setData({ content: row.content, workspace: row.workspace });$new$
  );

  next_source := replace(
    next_source,
    $old$  dirty.value = false;
  message.value = `模板“${result?.name || payload.name}”已保存`;
  return result;$old$,
    $new$  const savedName = typeof result?.name === 'string' && result.name.trim()
    ? result.name.trim()
    : payload.name;
  const savedVersion = Number.isInteger(result?.version) && result.version > 0 ? result.version : payload.version;
  templateName.value = savedName;
  templateStatus.value = `数据库模板 · v${savedVersion}`;
  templateDirty.value = false;
  emitTemplateInfo();
  message.value = `模板“${savedName}”已保存`;
  return result;$new$
  );

  next_source := replace(
    next_source,
    $old$  dirty.value = false;
  message.value = '已清空画布';
  return snapshot();$old$,
    $new$  suppressDirty = true;
  try {
    instance.store.mergeRemoteChanges(() => instance.run(() => instance.deleteShapes(shapeIds), { history: 'ignore', ignoreShapeLock: true }));
  } finally {
    suppressDirty = false;
  }
  templateName.value = '新建模板';
  templateStatus.value = '尚未保存';
  templateDirty.value = false;
  emitTemplateInfo();
  message.value = '已新建空白模板';
  return snapshot();$new$
  );

  next_source := replace(
    next_source,
    $old$function handleReady() {
  readyPromiseResolve?.();
  readyPromiseResolve = undefined;
  void loadData().catch((error) => { message.value = error instanceof Error ? error.message : '模板加载失败'; });
}

function markDirty() { dirty.value = true; }$old$,
    $new$function handleReady() {
  readyPromiseResolve?.();
  readyPromiseResolve = undefined;
  emitTemplateInfo();
  void loadData().catch((error) => { message.value = error instanceof Error ? error.message : '模板加载失败'; });
}

function markDirty() {
  if (suppressDirty || dirty.value) return;
  dirty.value = true;
  templateStatus.value = '有未保存修改';
  emitTemplateInfo();
}$new$
  );

  update public.lowcode_materials
  set
    source_text = next_source,
    source_hash = md5(next_source),
    material_version = '1.1.0',
    updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$migration$;
