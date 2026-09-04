-- Register the standard low-code actions exposed by the approval workflow
-- designer material.
begin;

insert into public.lowcode_node_actions (
  node_type, node_label, node_icon, action_code, label, description,
  source_code, parameters, returns, insert_text_template,
  applicable_when, is_data_source_loader, enabled, is_system, sort_order
) values
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'validate', '校验模型图',
  '校验审批节点、连线及分支配置，返回是否通过。',
  $action$
async function main() {
  return await this.$node.call('material.validate');
}
  $action$,
  '[]'::jsonb,
  '校验通过返回 true，否则返回 false。',
  'const valid = await this.executeAction({\n  node: {{nodeId}},\n  method: "validate",\n});',
  '{}'::jsonb, false, true, true, 10
),
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'loadData', '加载模型图',
  '重新加载当前审批流模型及其节点配置。',
  $action$
async function main() {
  return await this.$node.call('material.loadData', {
    options: this.event.payload.nodeAction.options,
  });
}
  $action$,
  '[{"name":"options","type":"object","description":"加载选项。"}]'::jsonb,
  '返回加载后的审批流模型。',
  'const model = await this.executeAction({\n  node: {{nodeId}},\n  method: "loadData",\n});',
  '{}'::jsonb, false, true, true, 20
),
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'setData', '设置模型图数据',
  '替换当前审批流模型并刷新画布。',
  $action$
async function main() {
  const value = this.event.payload.nodeAction.options.data;
  return await this.$node.call('material.setData', {
    value,
  });
}
  $action$,
  '[{"name":"data","type":"object","required":true,"description":"审批流模型对象。"}]'::jsonb,
  '返回更新后的审批流模型。',
  'await this.executeAction({\n  node: {{nodeId}},\n  method: "setData",\n  data: {},\n});',
  '{}'::jsonb, false, true, true, 30
),
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'getData', '获取模型图数据',
  '获取当前审批流模型的深拷贝。',
  $action$
async function main() {
  return await this.$node.call('material.getData');
}
  $action$,
  '[]'::jsonb,
  '返回当前审批流模型对象。',
  'const model = await this.executeAction({\n  node: {{nodeId}},\n  method: "getData",\n});',
  '{}'::jsonb, false, true, true, 40
),
(
  'approvalWorkflowDesigner', '审批流模型图', 'ri-git-branch-line', 'resetData', '重置模型图数据',
  '恢复审批流模型的默认开始、审批、结束结构。',
  $action$
async function main() {
  return await this.$node.call('material.setData', {
    value: {
      schemaVersion: 1,
      code: 'approval_workflow',
      name: '审批流程',
      documentType: 'document',
      status: 'draft',
      variables: [],
      nodes: [
        { id: 'start', type: 'start', name: '开始', position: { x: 330, y: 48 } },
        { id: 'approval', type: 'approval', name: '审批', position: { x: 330, y: 190 }, config: { assigneeStrategy: { type: 'initiatorManager', level: 1 }, allowReject: true } },
        { id: 'end', type: 'end', name: '结束', position: { x: 330, y: 332 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'approval' },
        { id: 'e2', source: 'approval', target: 'end' },
      ],
    },
  });
}
  $action$,
  '[]'::jsonb,
  '返回重置后的审批流模型对象。',
  'const model = await this.executeAction({\n  node: {{nodeId}},\n  method: "resetData",\n});',
  '{}'::jsonb, false, true, true, 50
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
