-- 修复 AdminService 要求 resource_name 与 table_name 一致的校验错误。
-- 仅修复 admin 的 WMS 物料读取资源及其页面引用，不改 planning 服务配置和物料数据。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtextextended('enlearn.wms.material-resource-name-fix',0));

do $resource$
begin
  if exists(select 1 from public.service_resource_metadata
      where service_name='admin' and resource_name='wms_material' and table_name<>'planning_item') then
    raise exception 'Unexpected wms_material target table';
  end if;
  if exists(select 1 from public.service_resource_metadata where service_name='admin' and resource_name='wms_material')
    and exists(select 1 from public.service_resource_metadata where service_name='admin' and resource_name='planning_item') then
    raise exception 'Conflicting admin.planning_item resource; inspect before renaming';
  end if;
  update public.service_resource_metadata
    set resource_name='planning_item',version=version+1,updated_at=now()
    where service_name='admin' and resource_name='wms_material' and table_name='planning_item';
end;
$resource$;

create temporary table wms_material_pages_fixed on commit drop as
  select id from public.lowcode_pages
  where left(code,4)='wms-' and schema::text like '%"wms_material"%';

update public.lowcode_pages
set schema=replace(schema::text,'"wms_material"','"planning_item"')::jsonb,
  version=version+1,updated_at=now(),published_at=now()
where id in(select id from wms_material_pages_fixed);

-- 历史页配置同样清理错误别名，避免恢复旧版本后再触发相同错误。
update public.lowcode_page_versions v
set schema=replace(v.schema::text,'"wms_material"','"planning_item"')::jsonb
from public.lowcode_pages p
where p.id=v.page_id and left(p.code,4)='wms-' and v.schema::text like '%"wms_material"%';

insert into public.lowcode_page_versions(page_id,version,schema,published_at)
select p.id,p.version,p.schema,p.published_at from public.lowcode_pages p
where p.id in(select id from wms_material_pages_fixed)
on conflict(page_id,version) do update set schema=excluded.schema,published_at=excluded.published_at;

-- 如果此前已注册错误别名，下次 CRUD 将按正确名字重新注册。
delete from public.dynamic_crud_resource_registry
where resource_name='wms_material' and table_name='planning_item';

do $verify$
begin
  if exists(select 1 from public.service_resource_metadata where service_name='admin' and enabled
      and (resource_name<>regexp_replace(table_name,'^.*\.','') or config->>'tableName' is distinct from table_name)) then
    raise exception 'Admin resource metadata still violates table-name contract';
  end if;
  if exists(select 1 from public.lowcode_pages where left(code,4)='wms-' and schema::text like '%"wms_material"%') then
    raise exception 'WMS page still references invalid material resource alias';
  end if;
end;
$verify$;
select pg_notify('pgrst','reload schema');
commit;
