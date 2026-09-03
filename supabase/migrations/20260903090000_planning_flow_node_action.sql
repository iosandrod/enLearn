-- Register the database-owned data loader for the planning flow node.

begin;

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values (
  'planningFlow', '工艺路线图', 'ri-route-line', 'loadData', '获取工艺路线数据',
  '按照工艺路线图的数据源配置请求节点、连线和容器数据，并同步到流程图。',
  $action$
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function main() {
  const action = this.event.payload.nodeAction;
  const { block, options, dataSources } = action;
  const sourceKey = typeof block.sourceKey === 'string' ? block.sourceKey.trim() : '';
  if (!sourceKey) throw new Error(`工艺路线图 "${block.id}" 未配置数据源。`);
  const source = dataSources[sourceKey];
  if (!source) throw new Error(`工艺路线图 "${block.id}" 没有可用的数据源。`);

  const configuredPostData = isRecord(source.postData) ? source.postData : {};
  const resolvedPostData = await this.$node.call('runtime.resolve', {
    value: configuredPostData,
  });
  const postData = {
    ...(isRecord(resolvedPostData) ? resolvedPostData : {}),
    ...(isRecord(options.postData) ? options.postData : {}),
  };
  const filters = {
    ...(isRecord(postData.filters) ? postData.filters : {}),
    ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
    ...(isRecord(options.filters) ? options.filters : {}),
  };
  const requestPostData = Object.keys(filters).length
    ? { ...postData, filters }
    : postData;

  const version = await this.$node.call('source.begin', { sourceKey });
  try {
    const value = await this.$node.call('source.invoke', {
      sourceKey,
      postData: requestPostData,
    });
    if (await this.$node.call('source.isCurrent', { sourceKey, version })) {
      await this.$node.call('source.set', {
        sourceKey,
        value,
        resetGridBaseline: false,
      });
    }
    return value;
  } finally {
    await this.$node.call('source.finish', { sourceKey, version });
  }
}
  $action$,
  '[{"name":"filters","type":"object","description":"附加过滤条件。"},{"name":"postData","type":"object","description":"附加请求参数。"}]'::jsonb,
  '返回包含 nodes、edges 和 containers 的流程图数据对象。',
  'const flow = await this.executeAction({\n  node: {{nodeId}},\n  method: "loadData",\n});',
  '{}'::jsonb, true, true, true, 10
)
on conflict (node_type, action_code) do update set
  node_label = excluded.node_label,
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
  updated_at = timezone('utc'::text, now());

select pg_notify('pgrst', 'reload schema');

commit;
