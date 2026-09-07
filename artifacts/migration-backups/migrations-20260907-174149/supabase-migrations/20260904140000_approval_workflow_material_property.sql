-- Property form for the approval workflow designer visual material.
begin;
insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'material-prop.approval-workflow-designer',
  '设计器属性 - 审批流模型图',
  '审批流模型图的低代码属性配置。',
  $schema${"componentKey":"approval-workflow-designer","title":"审批流模型图属性","fields":[{"field":"__block._vid","target":"block","path":"_vid","label":"组件 ID","component":"vxe-input","valueKind":"string","props":{"disabled":true}},{"field":"sourceKey","target":"props","path":"sourceKey","label":"模型数据源","component":"vxe-input","valueKind":"string","defaultValue":"workflowModel"},{"field":"readonly","target":"props","path":"readonly","label":"只读预览","component":"vxe-switch","valueKind":"boolean","defaultValue":false},{"field":"model","target":"props","path":"model","label":"模型图数据","component":"lc-json-editor","valueKind":"json","props":{"rows":8,"jsonRootType":"object","jsonValueMode":"parsed"}}],"layout":[{"kind":"tabs","defaultKey":"basic","tabs":[{"key":"basic","label":"基础","blocks":[{"kind":"field","field":"__block._vid"},{"kind":"field","field":"sourceKey"},{"kind":"field","field":"readonly"}]},{"key":"model","label":"模型","blocks":[{"kind":"field","field":"model"}]}]}],"actions":[]}$schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc'::text, now());
commit;
