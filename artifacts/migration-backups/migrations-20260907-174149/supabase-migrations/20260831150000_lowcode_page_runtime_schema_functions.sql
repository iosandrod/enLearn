-- Promote page-owned schema functions into the database runtime catalog.
-- System functions remain the native entries from the previous migration;
-- these rows contain only page-owned business scripts.

delete from public.lowcode_page_runtime as runtime
where runtime.is_system = false
  and runtime.function_type = 'page_function'
  and runtime.runtime_key like 'page:%:function:%'
  and not exists (
    select 1
    from public.lowcode_pages as page
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(page.schema->'functions') = 'array' then page.schema->'functions'
        else '[]'::jsonb
      end
    ) as function_item
    where page.id = runtime.page_id
      and runtime.runtime_key = 'page:' || page.id::text || ':function:' || md5(btrim(function_item->>'name'))
      and nullif(btrim(function_item->>'script'), '') is not null
  );

insert into public.lowcode_page_runtime (
  page_id, runtime_key, function_name, function_type, category, page_type,
  label, description, execution_mode, source_code, parameters,
  capabilities, status, enabled, is_system, sort_order, source_hash
)
select
  page.id,
  'page:' || page.id::text || ':function:' || md5(btrim(function_item->>'name')),
  btrim(function_item->>'name'),
  'page_function',
  'page_flow',
  page.page_type,
  coalesce(nullif(btrim(function_item->>'label'), ''), btrim(function_item->>'name')),
  coalesce(function_item->>'description', ''),
  'script',
  function_item->>'script',
  '[]'::jsonb,
  '[]'::jsonb,
  case when page.status = 'published' then 'published' else 'draft' end,
  case
    when function_item->>'enabled' in ('true', 'false') then (function_item->>'enabled')::boolean
    else true
  end,
  false,
  (row_number() over (partition by page.id order by function_item->>'name'))::integer,
  md5(coalesce(function_item->>'script', ''))
from public.lowcode_pages as page
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(page.schema->'functions') = 'array' then page.schema->'functions'
    else '[]'::jsonb
  end
) as function_item
where nullif(btrim(function_item->>'name'), '') is not null
  and nullif(btrim(function_item->>'script'), '') is not null
on conflict (runtime_key, version) do update set
  page_id = excluded.page_id,
  function_name = excluded.function_name,
  function_type = excluded.function_type,
  category = excluded.category,
  page_type = excluded.page_type,
  label = excluded.label,
  description = excluded.description,
  execution_mode = excluded.execution_mode,
  source_code = excluded.source_code,
  parameters = excluded.parameters,
  capabilities = excluded.capabilities,
  status = excluded.status,
  enabled = excluded.enabled,
  is_system = excluded.is_system,
  sort_order = excluded.sort_order,
  source_hash = excluded.source_hash,
  updated_at = timezone('utc'::text, now());
