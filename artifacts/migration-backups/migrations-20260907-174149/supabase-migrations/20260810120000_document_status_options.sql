-- Reusable document lifecycle statuses for system dropdowns.

begin;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  cache_ttl_seconds,
  status,
  sort_order,
  is_system
) values (
  'document_status',
  U&'\5355\636E\72B6\6001',
  U&'\901A\7528\5355\636E\5BA1\6279\4E0E\6267\884C\751F\547D\5468\671F\72B6\6001\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  50,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values
  ('document_status', U&'\8349\7A3F',       'D', 'active',  10, true, '{"semanticCode":"draft"}'::jsonb),
  ('document_status', U&'\5F85\5BA1\6279', 'P', 'active',  20, true, '{"semanticCode":"pending_approval"}'::jsonb),
  ('document_status', U&'\5BA1\6279\4E2D', 'I', 'active',  30, true, '{"semanticCode":"approving"}'::jsonb),
  ('document_status', U&'\5DF2\5BA1\6279', 'A', 'active',  40, true, '{"semanticCode":"approved"}'::jsonb),
  ('document_status', U&'\5DF2\9A73\56DE', 'R', 'active',  50, true, '{"semanticCode":"rejected"}'::jsonb),
  ('document_status', U&'\5DF2\64A4\56DE', 'W', 'active',  60, true, '{"semanticCode":"withdrawn"}'::jsonb),
  ('document_status', U&'\6267\884C\4E2D', 'E', 'active',  70, true, '{"semanticCode":"processing"}'::jsonb),
  ('document_status', U&'\5DF2\5B8C\6210', 'F', 'active',  80, true, '{"semanticCode":"completed"}'::jsonb),
  ('document_status', U&'\5DF2\5173\95ED', 'L', 'active',  90, true, '{"semanticCode":"closed"}'::jsonb),
  ('document_status', U&'\5DF2\4F5C\5E9F', 'C', 'active', 100, true, '{"semanticCode":"canceled"}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

do $validation$
declare
  v_option_count integer;
  v_invalid_value_count integer;
begin
  select
    count(*),
    count(*) filter (where value !~ '^[A-Z]$')
  into v_option_count, v_invalid_value_count
  from public.system_option_items
  where source_code = 'document_status'
    and value in ('D', 'P', 'I', 'A', 'R', 'W', 'E', 'F', 'L', 'C');

  if v_option_count <> 10 or v_invalid_value_count <> 0 then
    raise exception 'Document status dropdown validation failed: options %, invalid values %.',
      v_option_count, v_invalid_value_count;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
