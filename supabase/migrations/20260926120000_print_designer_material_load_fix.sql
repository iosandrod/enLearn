begin;

do $material_migration$
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
    raise exception 'label-designer material was not found';
  end if;

  start_pos := strpos(next_source, 'async function setData(');
  end_pos := strpos(next_source, 'async function loadData(');
  if start_pos <= 0 or end_pos <= start_pos then
    raise exception 'label-designer setData function was not found';
  end if;

  next_source := left(next_source, start_pos - 1) || $set_data$
async function setData(value: unknown) {
  if (!value || (typeof value !== 'object' && typeof value !== 'string')) throw new Error('标签设计器 setData 的 value 必须是模板对象或 pages 数组。');
  const parsedValue = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
  const data = Array.isArray(parsedValue) ? { pages: parsedValue } : parsedValue as Record<string, any>;
  const instance = await waitForEditor();
  const parseObject = (input: any) => {
    if (typeof input !== 'string') return input;
    try { return JSON.parse(input); } catch { return input; }
  };
  const parsedContent = parseObject(data.content);
  const document = Array.isArray(parsedContent)
    ? { ...data, pages: parsedContent }
    : parsedContent && typeof parsedContent === 'object' ? parsedContent : data;
  const normalizePageContent = (value: any, pageId: string) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    value = parseObject(value);
    if (!value?.schema || !Array.isArray(value.shapes) || !Array.isArray(value.rootShapeIds) || !Array.isArray(value.assets)) return null;
    const rawShapes = value.shapes.filter((shape: any) => shape && typeof shape === 'object' && typeof shape.id === 'string' && typeof shape.type === 'string' && typeof shape.typeName === 'string');
    const rawShapeIds = new Set(rawShapes.map((shape: any) => shape.id));
    const shapes = rawShapes.map((shape: any, index: number) => ({
      ...shape,
      x: Number.isFinite(shape.x) ? shape.x : 0,
      y: Number.isFinite(shape.y) ? shape.y : 0,
      rotation: Number.isFinite(shape.rotation) ? shape.rotation : 0,
      opacity: Number.isFinite(shape.opacity) ? shape.opacity : 1,
      index: typeof shape.index === 'string' && shape.index ? shape.index : `a${index + 1}`,
      meta: shape.meta && typeof shape.meta === 'object' ? shape.meta : {},
      parentId: typeof shape.parentId === 'string' && rawShapeIds.has(shape.parentId) ? shape.parentId : pageId,
    }));
    const shapeIds = new Set(shapes.map((shape: any) => shape.id));
    const rootShapeIds = [
      ...(Array.isArray(value.rootShapeIds) ? value.rootShapeIds : []),
      ...shapes.filter((shape: any) => shape.parentId === pageId).map((shape: any) => shape.id),
    ].filter((id: any, index: number, ids: any[]) => typeof id === 'string' && shapeIds.has(id) && ids.indexOf(id) === index);
    const bindings = (Array.isArray(value.bindings) ? value.bindings : []).filter((binding: any) => (
      binding && typeof binding === 'object' && typeof binding.id === 'string' &&
      typeof binding.fromId === 'string' && typeof binding.toId === 'string' &&
      shapeIds.has(binding.fromId) && shapeIds.has(binding.toId)
    ));
    return { schema: value.schema, shapes, rootShapeIds, bindings, assets: value.assets, users: Array.isArray(value.users) ? value.users : [] };
  };
  const parsedPages = parseObject(document.pages);
  const rawPages = Array.isArray(parsedPages) ? parsedPages : Array.isArray(data.pages) ? data.pages : [];
  const pages = rawPages.map((page: any) => {
    const parsedPage = parseObject(page);
    const parsedPageContent = parseObject(parsedPage?.content);
    const pageId = typeof parsedPage?.id === 'string' ? parsedPage.id.trim() : '';
    const content = pageId ? normalizePageContent(parsedPageContent?.content ?? parsedPageContent ?? parsedPage, pageId) : null;
    return content && pageId ? { id: pageId, name: typeof parsedPage.name === 'string' && parsedPage.name.trim() ? parsedPage.name : '页面', content } : null;
  }).filter(Boolean) as Array<{ id: string; name: string; content: Record<string, any> }>;

  // Page creation and page switching must use the editor's own transactions.
  // Wrapping them in mergeRemoteChanges leaves a new page without its camera.
  const loadedPageIds = new Map<string, any>();
  if (pages.length) {
    for (const page of pages) {
      if (!instance.getPage(page.id)) instance.createPage({ id: page.id, name: page.name });
      const pageRecord = instance.getPage(page.id);
      if (!pageRecord) continue;
      loadedPageIds.set(page.id, pageRecord.id);
      if (pageRecord.name !== page.name) instance.renamePage(pageRecord.id, page.name);
    }
    const firstPageId = loadedPageIds.get(pages[0].id);
    if (firstPageId && instance.getCurrentPageId() !== firstPageId) instance.setCurrentPage(firstPageId);
    const targetPageIds = new Set(loadedPageIds.values());
    for (const page of instance.getPages()) {
      if (!targetPageIds.has(page.id) && instance.getPages().length > 1) instance.deletePage(page.id);
    }
    for (const page of pages) {
      const pageId = loadedPageIds.get(page.id);
      if (!pageId) continue;
      if (instance.getCurrentPageId() !== pageId) instance.setCurrentPage(pageId);
      const oldIds = [...instance.getPageShapeIds(pageId)];
      if (oldIds.length) instance.deleteShapes(oldIds);
      instance.putContentOntoCurrentPage(clone(page.content), { preservePosition: true, preserveIds: true, select: false });
    }
    const requestedCurrent = document.currentPageId && loadedPageIds.get(document.currentPageId);
    const currentPageId = requestedCurrent || firstPageId;
    if (currentPageId && instance.getCurrentPageId() !== currentPageId) instance.setCurrentPage(currentPageId);
  } else {
    const oldIds = instance.getCurrentPageShapeIdsSorted();
    if (oldIds.length) instance.deleteShapes(oldIds);
    const singlePageContent = normalizePageContent(document, instance.getCurrentPageId());
    if (singlePageContent) instance.putContentOntoCurrentPage(clone(singlePageContent), { preservePosition: true, preserveIds: true, select: false });
  }
  instance.selectNone();

  const workspace = document.workspace && typeof document.workspace === 'object'
    ? document.workspace
    : data.workspace && typeof data.workspace === 'object' ? data.workspace : undefined;
  if (workspace) designer.value?.applyWorkspaceTemplateConfig?.(clone(workspace));
  if (typeof data.id === 'string' && data.id.trim()) templateId.value = data.id.trim();
  if (typeof data.name === 'string' && data.name.trim()) templateName.value = data.name.trim();
  if (data.status === 'draft' || data.status === 'active' || data.status === 'archived') templateStatus.value = data.status;
  if (Number.isInteger(data.version) && data.version > 0) templateVersion.value = data.version;
  dirty.value = false;
  return getTemplateInfo();
}

$set_data$ || substring(next_source from end_pos);

  update public.lowcode_materials
  set source_text = next_source,
      source_hash = md5(next_source),
      material_version = '1.6.1',
      updated_at = timezone('utc', now())
  where material_kind = 'page'
    and code = 'label-designer'
    and source_text is distinct from next_source;
end
$material_migration$;

commit;
