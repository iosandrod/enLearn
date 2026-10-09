begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
select
  'print-designer.datasource-typeorm',
  '打印数据库数据源配置',
  '打印数据源管理，连接与查询配置使用子表单，支持 MSSQL、MySQL、PostgreSQL。',
  'print_datasource_typeorm',
  '{
    "title": "数据库数据源配置",
    "columns": 2,
    "fields": [
      {"field":"code","label":"数据源编码","component":"vxe-input","props":{"maxlength":120,"placeholder":"例如 sales.orders"},"rules":[{"required":true,"message":"请输入数据源编码。"}]},
      {"field":"name","label":"数据源名称","component":"vxe-input","props":{"maxlength":160,"placeholder":"例如 销售订单数据库"}},
      {"field":"enabled","label":"启用","component":"vxe-switch","span":2},
      {
        "field":"schema","label":"连接与查询配置","component":"lc-sub-form","span":2,
        "props":{"schema":{
          "title":"连接与查询配置","columns":2,
          "fields":[
            {"field":"driver","label":"数据库驱动","component":"vxe-select","options":[{"label":"MSSQL / SQL Server","value":"mssql"},{"label":"MySQL","value":"mysql"},{"label":"PostgreSQL","value":"pgsql"}],"rules":[{"required":true,"message":"请选择数据库驱动。"}]},
            {"field":"timeoutMs","label":"连接测试超时（ms）","component":"lc-number-input","props":{"disabled":true},"defaultValue":2000},
            {"field":"host","label":"主机地址","component":"vxe-input","props":{"placeholder":"IP 或域名，不含协议"},"rules":[{"required":true,"message":"请输入主机地址。"}]},
            {"field":"port","label":"端口","component":"lc-number-input","props":{"min":1,"max":65535,"step":1},"rules":[{"required":true,"message":"请输入端口。"}]},
            {"field":"database","label":"数据库名称","component":"vxe-input","rules":[{"required":true,"message":"请输入数据库名称。"}]},
            {"field":"username","label":"用户名","component":"vxe-input","rules":[{"required":true,"message":"请输入用户名。"}]},
            {"field":"password","label":"密码","component":"vxe-password-input","props":{"autocomplete":"new-password"}},
            {"field":"applicationName","label":"应用名称","component":"vxe-input","props":{"placeholder":"EnLearn Print"}},
            {"field":"ssl","label":"启用 SSL / TLS","component":"vxe-switch","props":{"visibleWhen":{"field":"driver","includes":["mysql","pgsql"]}}},
            {"field":"encrypt","label":"MSSQL 加密连接","component":"vxe-switch","props":{"visibleWhen":{"field":"driver","equals":"mssql"}}},
            {"field":"trustServerCertificate","label":"信任服务器证书","component":"vxe-switch"},
            {"field":"instanceName","label":"MSSQL 实例名称（可选）","component":"vxe-input","props":{"placeholder":"填写后通过实例发现连接","visibleWhen":{"field":"driver","equals":"mssql"}}},
            {"field":"query","label":"查询 SQL","component":"vxe-textarea","span":2,"props":{"placeholder":"SELECT 查询；参数：MSSQL @p1，MySQL ?，PostgreSQL $1","auto-size":{"minRows":3,"maxRows":8}}},
            {"field":"parameters","label":"查询参数（数组）","component":"lc-json-editor","span":2,"props":{"jsonValueMode":"parsed","jsonRootType":"array"}}
          ],
          "actions":[]
        }}
      }
    ],
    "actions":[]
  }'::jsonb,
  true,
  null
where not exists (
  select 1 from public.lowcode_form_definitions where code = 'print-designer.datasource-typeorm'
);

-- Repair only the JSON editor value mode from the initial form revision.
update public.lowcode_form_definitions definition
set schema = jsonb_set(definition.schema,
      array['fields', (outer_field.ordinality - 1)::text, 'props', 'schema', 'fields',
        (nested_field.ordinality - 1)::text, 'props', 'jsonValueMode'],
      '"parsed"'::jsonb),
    updated_at = timezone('utc', now())
from public.lowcode_form_definitions source_definition
cross join lateral jsonb_array_elements(source_definition.schema->'fields') with ordinality outer_field(value, ordinality)
cross join lateral jsonb_array_elements(outer_field.value #> '{props,schema,fields}') with ordinality nested_field(value, ordinality)
where source_definition.id = definition.id
  and definition.code = 'print-designer.datasource-typeorm'
  and outer_field.value->>'field' = 'schema'
  and nested_field.value->>'field' = 'parameters'
  and nested_field.value #>> '{props,jsonValueMode}' = 'json';

select pg_notify('pgrst', 'reload schema');

commit;
