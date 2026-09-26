begin;

do $material_migration$
declare
  next_source text;
  start_pos integer;
  end_pos integer;
  old_start integer;
  old_end integer;
begin
  select source_text
    into next_source
  from public.lowcode_materials
  where material_kind = 'page'
    and code = 'label-designer'
  for update;

  if next_source is not null then
    start_pos := strpos(next_source, 'function snapshot()');
    end_pos := strpos(next_source, 'async function waitForEditor()');
    if start_pos > 0 and end_pos > start_pos then
      next_source := left(next_source, start_pos - 1) || $snapshot$
function snapshot() {
  const instance = editor();
  if (!instance) throw new Error('标签设计器尚未就绪。');
  const shapeIds = instance.getCurrentPageShapeIdsSorted();
  const content = shapeIds.length ? instance.getContentFromCurrentPage(shapeIds) : null;
  return { content: clone(content ?? { shapes: [], bindings: [], assets: [], rootShapeIds: [], schema: {} }), workspace: workspace() };
}

async function getTemplateInfo() {
  const instance = await waitForEditor();
  const currentPageId = instance.getCurrentPageId();
  const pages = [];
  for (const page of instance.getPages()) {
    const shapeIds = [...instance.getPageShapeIds(page.id)].sort();
    const pageContent = instance.getContentFromCurrentPage(shapeIds, page.id);
    const resolvedContent = await instance.resolveAssetsInContent(pageContent);
    if (resolvedContent) pages.push({ id: page.id, name: page.name, content: clone(resolvedContent) });
  }
  if (!pages.length) return null;
  const currentWorkspace = workspace();
  return {
    // A multi-page template is represented by pages only. Do not copy a
    // representative page's schema/shapes to the document root.
    content: { pages: clone(pages), currentPageId, workspace: currentWorkspace },
    pages: clone(pages),
    currentPageId,
    workspace: currentWorkspace,
    templateId: templateId.value,
    templateName: templateName.value,
    templateStatus: templateStatus.value,
    templateVersion: templateVersion.value,
  };
}

$snapshot$ || substring(next_source from end_pos);
    end if;

    start_pos := strpos(next_source, 'async function setData(');
    end_pos := strpos(next_source, 'async function loadData(');
    if start_pos > 0 and end_pos > start_pos then
      next_source := left(next_source, start_pos - 1) || $set_data$
async function setData(value: unknown) {
  if (!value || (typeof value !== 'object' && typeof value !== 'string')) throw new Error('标签设计器 setData 的 value 必须是模板对象或 pages 数组。');
  const parsedValue = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
  const data = Array.isArray(parsedValue)
    ? { pages: parsedValue }
    : parsedValue as Record<string, any>;
  const instance = await waitForEditor();
  const parseObject = (input: any) => {
    if (typeof input !== 'string') return input;
    try { return JSON.parse(input); } catch { return input; }
  };
  const parsedContent = parseObject(data.content);
  const document = Array.isArray(parsedContent)
    ? { ...data, pages: parsedContent }
    : parsedContent && typeof parsedContent === 'object'
      ? parsedContent
      : data;
  const normalizePageContent = (value: any) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    value = parseObject(value);
    const rawShapes = Array.isArray(value?.shapes) ? value.shapes : [];
    const shapes = rawShapes.filter((shape: any) => shape && typeof shape === 'object').map((shape: any, index: number) => ({
      ...shape,
      x: Number.isFinite(shape.x) ? shape.x : 0,
      y: Number.isFinite(shape.y) ? shape.y : 0,
      rotation: Number.isFinite(shape.rotation) ? shape.rotation : 0,
      opacity: Number.isFinite(shape.opacity) ? shape.opacity : 1,
      index: typeof shape.index === 'string' && shape.index ? shape.index : `a${index + 1}`,
      meta: shape.meta && typeof shape.meta === 'object' ? shape.meta : {},
    }));
    const rootShapeIds = Array.isArray(value.rootShapeIds) ? value.rootShapeIds : [];
    const assets = Array.isArray(value.assets) ? value.assets : [];
    const bindings = Array.isArray(value.bindings) ? value.bindings : [];
    const users = Array.isArray(value.users) ? value.users : [];
    if (!value?.schema || !Array.isArray(value.shapes) || !Array.isArray(value.rootShapeIds) || !Array.isArray(value.assets)) return null;
    return {
      schema: value.schema,
      shapes,
      rootShapeIds,
      bindings,
      assets,
      users,
    };
  };
  // The persisted document format is { pages, currentPageId, workspace }.
  // Read pages from that first-level content object and load each page as a
  // separate TLContent document.
  const parsedPages = parseObject(document.pages);
  const rawPages = Array.isArray(parsedPages)
    ? parsedPages
    : Array.isArray(data.pages)
      ? data.pages
      : [];
  const pages = rawPages
    .map((page: any) => {
      const parsedPage = parseObject(page);
      const parsedPageContent = parseObject(parsedPage?.content);
      const content = normalizePageContent(parsedPageContent?.content ?? parsedPageContent ?? parsedPage);
      return content && typeof parsedPage?.id === 'string' && parsedPage.id.trim()
        ? { id: parsedPage.id as any, name: typeof parsedPage.name === 'string' && parsedPage.name.trim() ? parsedPage.name : '页面', content }
        : null;
    })
    .filter(Boolean) as Array<{ id: string; name: string; content: Record<string, any> }>;
  const loadedPageIds = new Map<string, any>();
  instance.store.mergeRemoteChanges(() => instance.run(() => {
    if (pages.length) {
      const targetPageIds = new Set<any>();
      for (const page of pages) {
        const requestedId = page.id;
        if (!instance.getPage(requestedId)) {
          // Editor.createPage returns the editor instance, not the created page.
          // Read the page back by its requested TLPageId after creation.
          instance.createPage({ id: requestedId, name: page.name || '页面' });
        }
        const pageId = instance.getPage(requestedId)?.id;
        if (!pageId) continue;
        loadedPageIds.set(requestedId, pageId);
        targetPageIds.add(pageId);
        if (instance.getPage(pageId)?.name !== (page.name || '页面')) instance.renamePage(pageId, page.name || '页面');
        const oldIds = [...instance.getPageShapeIds(pageId)];
        if (oldIds.length) instance.deleteShapes(oldIds);
        instance.setCurrentPage(pageId);
        instance.putContentOntoCurrentPage(clone(page.content), { preservePosition: true, preserveIds: false, select: false });
      }
      for (const page of instance.getPages()) {
        if (!targetPageIds.has(page.id) && instance.getPages().length > 1) instance.deletePage(page.id);
      }
      const requestedCurrent = document.currentPageId && loadedPageIds.get(document.currentPageId);
      instance.setCurrentPage(requestedCurrent || loadedPageIds.get(pages[0].id));
    } else {
      const oldIds = instance.getCurrentPageShapeIdsSorted();
      if (oldIds.length) instance.deleteShapes(oldIds);
      const singlePageContent = normalizePageContent(document);
      if (singlePageContent) {
        instance.putContentOntoCurrentPage(clone(singlePageContent), { preservePosition: true, preserveIds: false, select: false });
      }
    }
    instance.selectNone();
  }, { history: 'ignore', ignoreShapeLock: true }));
  const workspace = document.workspace && typeof document.workspace === 'object'
    ? document.workspace
    : data.workspace && typeof data.workspace === 'object'
      ? data.workspace
      : undefined;
  if (workspace) designer.value?.applyWorkspaceTemplateConfig?.(clone(workspace));
  if (typeof data.id === 'string' && data.id.trim()) templateId.value = data.id.trim();
  if (typeof data.name === 'string' && data.name.trim()) templateName.value = data.name.trim();
  if (data.status === 'draft' || data.status === 'active' || data.status === 'archived') {
    templateStatus.value = data.status;
  }
  if (Number.isInteger(data.version) && data.version > 0) templateVersion.value = data.version;
  dirty.value = false;
  return getTemplateInfo();
}

function stripTemplateMetadata(value: Record<string, any>) {
  const { pages: _pages, currentPageId: _currentPageId, workspace: _workspace, ...content } = value;
  return content;
}

$set_data$ || substring(next_source from end_pos);
    end if;

    start_pos := strpos(next_source, 'async function loadData(');
    end_pos := strpos(next_source, 'async function save(');
    if start_pos > 0 and end_pos > start_pos then
      next_source := left(next_source, start_pos - 1) || $load_data$
async function loadData(options: Record<string, any> = {}) {
  const requestedId = String(options?.templateId || '').trim();
  if (!requestedId) return getTemplateInfo();
  const api = host.getServiceApi();
  const rows = await api.invoke<any[]>('admin', 'listItems', {
    tableName: 'print_templates',
    filters: { id: requestedId },
    page: 1,
    pageSize: 1,
    limit: 1,
  });
  const record = Array.isArray(rows) ? rows[0] : undefined;
  if (!record) throw new Error(`未找到打印模板：${requestedId}`);
  await setData(record);
  return getTemplateInfo();
}

$load_data$ || substring(next_source from end_pos);
    end if;

    start_pos := strpos(next_source, 'async function save(');
    end_pos := strpos(next_source, 'async function resetData()');
    if start_pos > 0 and end_pos > start_pos then
      next_source := left(next_source, start_pos - 1) || $save_data$
async function save(options: Record<string, any> = {}) {
  if (options?.savedRecord && typeof options.savedRecord === 'object') {
    const result = options.savedRecord;
    templateId.value = String(result.id || templateId.value || '').trim();
    templateName.value = String(result.name || templateName.value || '新建模板');
    templateVersion.value = Number.isInteger(result.version) && result.version > 0 ? result.version : templateVersion.value;
    templateStatus.value = `数据库模板 · v${templateVersion.value}`;
    templateDirty.value = false;
    dirty.value = false;
    return result;
  }
  const info = options?.templateInfo && typeof options.templateInfo === 'object' ? options.templateInfo : await getTemplateInfo();
  if (!info?.content) throw new Error('模板内容尚未就绪，无法保存。');
  const api = host.getServiceApi();
  const id = String(templateId.value || props.block.templateId || host.getRoute().query?.templateId || '').trim();
  const payload = {
    name: String(templateName.value || props.block.templateName || '标签打印模板'),
    content: clone(info.content),
    workspace: clone(info.workspace || {}),
    status: 'active',
    version: templateVersion.value,
    metadata: { editor: 'tldraw-vue', source: 'lowcode-label-designer', schemaVersion: 1 },
  };
  const result = await api.invoke<any>('admin', 'saveItem', { resource: 'print_templates', ...(id ? { id } : {}), data: payload });
  templateId.value = String(result?.id || id || '').trim();
  templateName.value = String(result?.name || payload.name);
  templateVersion.value = Number.isInteger(result?.version) && result.version > 0 ? result.version : templateVersion.value;
  templateStatus.value = `数据库模板 · v${templateVersion.value}`;
  templateDirty.value = false;
  dirty.value = false;
  message.value = `模板“${templateName.value}”已保存`;
  return result;
}

$save_data$ || substring(next_source from end_pos);
    end if;

    old_start := strpos(next_source, '    getTemplateInfo: () => ({');
    old_end := case
      when old_start > 0 then old_start + strpos(substring(next_source from old_start), '    }),') - 1
      else 0
    end;
    if old_start > 0 and old_end > old_start then
      next_source := left(next_source, old_start - 1) || substring(next_source from old_end + 8);
    end if;
    if strpos(next_source, '    getTemplateInfo,') = 0 then
      next_source := replace(next_source, '    getData: snapshot,', E'    getData: snapshot,\n    getTemplateInfo,');
    end if;
    -- Repair sources written by the first version of this migration, which
    -- accidentally persisted the two-character string "\\n".
    -- Normalize the literal backslash-n persisted by the first migration.
    next_source := replace(next_source, chr(92) || 'n', chr(10));
    update public.lowcode_materials
    set source_text = next_source,
        source_hash = md5(next_source),
        material_version = '1.6.0',
        updated_at = timezone('utc', now())
    where material_kind = 'page'
      and code = 'label-designer'
      and source_text is distinct from next_source;
  end if;
end
$material_migration$;

insert into public.lowcode_node_actions (
  node_type,
  node_label,
  node_icon,
  action_code,
  label,
  description,
  source_code,
  parameters,
  returns,
  insert_text_template,
  applicable_when,
  is_data_source_loader,
  enabled,
  is_system,
  sort_order,
  limits
)
values (
  'labelDesigner',
  '标签设计器',
  'ri-price-tag-3-line',
  'getTemplateInfo',
  '获取模板信息',
  '获取包含所有页面、当前页面和工作区配置的模板快照。',
  'async function main() { return await this.$node.call(''material.getTemplateInfo''); }',
  '[]'::jsonb,
  '返回多页模板快照。',
  'this.executeAction({ node: ''{{nodeId}}'', method: ''getTemplateInfo'' });',
  '{}'::jsonb,
  false,
  true,
  true,
  10,
  '{}'::jsonb
)
on conflict (node_type, action_code) do update
set node_label = excluded.node_label,
    node_icon = excluded.node_icon,
    label = excluded.label,
    description = excluded.description,
    source_code = excluded.source_code,
    parameters = excluded.parameters,
    returns = excluded.returns,
    insert_text_template = excluded.insert_text_template,
    applicable_when = excluded.applicable_when,
    is_data_source_loader = excluded.is_data_source_loader,
    enabled = excluded.enabled,
    is_system = excluded.is_system,
    sort_order = excluded.sort_order,
    limits = excluded.limits;

insert into public.lowcode_node_actions (
  node_type,
  node_label,
  node_icon,
  action_code,
  label,
  description,
  source_code,
  parameters,
  returns,
  insert_text_template,
  applicable_when,
  is_data_source_loader,
  enabled,
  is_system,
  sort_order,
  limits
)
values (
  'labelDesigner',
  '标签设计器',
  'ri-price-tag-3-line',
  'loadData',
  '加载模板数据',
  '按模板 ID 从打印模板数据源加载并恢复标签设计器内容。',
  'async function main() { return await this.$node.call(''material.loadData'', this.event.payload.nodeAction.options); }',
  '[{"name":"templateId","label":"模板 ID","type":"string","required":true}]'::jsonb,
  '返回加载后的多页模板快照。',
  'this.executeAction({ node: ''{{nodeId}}'', method: ''loadData'', templateId: ''{{templateId}}'' });',
  '{}'::jsonb,
  false,
  true,
  true,
  11,
  '{}'::jsonb
)
on conflict (node_type, action_code) do update
set node_label = excluded.node_label,
    node_icon = excluded.node_icon,
    label = excluded.label,
    description = excluded.description,
    source_code = excluded.source_code,
    parameters = excluded.parameters,
    returns = excluded.returns,
    insert_text_template = excluded.insert_text_template,
    applicable_when = excluded.applicable_when,
    is_data_source_loader = excluded.is_data_source_loader,
    enabled = excluded.enabled,
    is_system = excluded.is_system,
    sort_order = excluded.sort_order,
    limits = excluded.limits;

update public.lowcode_node_actions
set source_code = 'async function main() { return await this.$node.call(''material.save'', this.event.payload.nodeAction.options); }'
where node_type = 'labelDesigner'
  and action_code = 'save';

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
  return await this.executeAction({
    node: 'label-designer-canvas',
    method: 'save',
    templateInfo,
  });
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
