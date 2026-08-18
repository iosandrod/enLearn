-- Move the page-information form schema onto a reusable low-code editor page.

begin;

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  page_type,
  layout,
  status,
  keep_alive,
  schema,
  version,
  published_at
)
select
  'page-info-design',
  '/dashboard/low-code/page-info-design',
  '页面信息设计',
  '供 confirmLowCodePage 加载的页面信息编辑页。',
  'edit',
  'blank',
  'published',
  false,
  jsonb_build_object(
    'schemaVersion', 1,
    'code', 'page-info-design',
    'route', '/dashboard/low-code/page-info-design',
    'title', '页面信息设计',
    'description', '供 confirmLowCodePage 加载的页面信息编辑页。',
    'pageType', 'edit',
    'layout', 'blank',
    'status', 'published',
    'keepAlive', false,
    'dataSources', '{}'::jsonb,
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', 'page-info-form',
        'kind', 'form',
        'formType', 'default',
        'title', '页面信息',
        'initialValues', '{}'::jsonb,
        'schema', definition.schema - 'componentKey' - 'extendsVisualProps'
          - 'mergeBuiltinFields' - 'separateArrayTableTabs'
      )
    )
  ),
  1,
  timezone('utc'::text, now())
from public.lowcode_form_definitions definition
where definition.code = 'page-info-design'
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = excluded.published_at;

do $validation$
declare
  editor_form_schema jsonb;
begin
  select schema #> '{blocks,0,schema}'
  into editor_form_schema
  from public.lowcode_pages
  where code = 'page-info-design';

  if editor_form_schema is null
    or jsonb_typeof(editor_form_schema->'fields') <> 'array'
    or jsonb_typeof(editor_form_schema->'actions') <> 'array'
    or not (editor_form_schema->'fields' @> '[{"field":"code"}]'::jsonb)
    or not (editor_form_schema->'fields' @> '[{"field":"relateConfig"}]'::jsonb)
  then
    raise exception 'Page information low-code editor page migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
