-- Use status as the single lifecycle field for sales-order headers and lines.

begin;

drop trigger if exists planning_sales_order_line_sync on public.sales_order_lines;
drop trigger if exists planning_sales_order_sync on public.sales_orders;

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_orders'
      and column_name = 'approval_status'
  ) then
    update public.sales_orders
    set status = case
      when hold_status then 'on_hold'
      when lower(close_status) in ('closed', 'close') then 'closed'
      when lower(approval_status) in ('rejected', 'reject') then 'rejected'
      when lower(approval_status) in ('pending', 'approving', 'in_review') then 'pending'
      when lower(approval_status) in ('approved', 'approve', 'passed')
        and lower(status) in ('draft', 'open', '') then 'approved'
      else lower(coalesce(nullif(status, ''), 'draft'))
    end;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_order_lines'
      and column_name = 'close_status'
  ) then
    update public.sales_order_lines
    set status = case
      when lower(close_status) in ('closed', 'close') then 'closed'
      else lower(coalesce(nullif(status, ''), 'open'))
    end;
  end if;
end;
$migration$;

drop index if exists public.idx_sales_orders_status;
create index idx_sales_orders_status
  on public.sales_orders (account_id, status);

create or replace function public.planning_sync_sales_order_line(p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  source_row record;
  mapped_item uuid;
  mapped_customer uuid;
  mapped_location uuid;
  missing_mappings text[] := array[]::text[];
  target_status text;
  target_due timestamptz;
  target_quantity numeric;
  target_demand_id uuid;
  v_sync_status text;
  v_sync_message text;
  snapshot jsonb;
begin
  select orders.account_id, orders.id order_id, orders.doc_no, orders.status order_status,
         orders.customer_code, orders.customer_id, orders.customer_name,
         lines.id line_id, lines.line_no, lines.status line_status,
         lines.item_code, lines.item_id source_item_id, lines.item_name, lines.warehouse_code,
         lines.ordered_qty, lines.open_qty, lines.need_date, lines.promise_date, lines.delivery_date,
         lines.project_code, lines.updated_at line_updated_at
  into source_row
  from public.sales_order_lines lines
  join public.sales_orders orders on orders.id = lines.order_id and orders.account_id = lines.account_id
  where lines.id = p_line_id;
  if not found then
    return jsonb_build_object('status', 'missing', 'sourceLineId', p_line_id);
  end if;

  snapshot := to_jsonb(source_row);
  target_due := coalesce(source_row.need_date, source_row.promise_date, source_row.delivery_date)::timestamptz;
  target_quantity := greatest(coalesce(source_row.open_qty, source_row.ordered_qty, 0), 0);

  select mapping.item_id into mapped_item
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'item' and mapping.status = 'active'
    and mapping.source_key in (source_row.source_item_id, source_row.item_code)
  order by case when mapping.source_key = source_row.source_item_id then 0 else 1 end limit 1;
  if mapped_item is null then
    select planning_item.id into mapped_item from public.planning_item planning_item
    where planning_item.account_id = source_row.account_id and planning_item.name = source_row.item_code limit 1;
  end if;

  select mapping.customer_id into mapped_customer
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'customer' and mapping.status = 'active'
    and mapping.source_key in (source_row.customer_id, source_row.customer_code)
  order by case when mapping.source_key = source_row.customer_id then 0 else 1 end limit 1;
  if mapped_customer is null then
    select planning_customer.id into mapped_customer from public.planning_customer planning_customer
    where planning_customer.account_id = source_row.account_id
      and planning_customer.name in (source_row.customer_code, source_row.customer_name)
    order by case when planning_customer.name = source_row.customer_code then 0 else 1 end limit 1;
  end if;

  select mapping.location_id into mapped_location
  from public.planning_source_mapping mapping
  where mapping.account_id = source_row.account_id and mapping.source_system = 'enlearn'
    and mapping.entity_type = 'location' and mapping.status = 'active'
    and mapping.source_key = source_row.warehouse_code limit 1;
  if mapped_location is null then
    select planning_location.id into mapped_location from public.planning_location planning_location
    where planning_location.account_id = source_row.account_id and planning_location.name = source_row.warehouse_code limit 1;
  end if;

  if mapped_item is null then missing_mappings := array_append(missing_mappings, 'item:' || coalesce(source_row.item_code, '(empty)')); end if;
  if mapped_customer is null then missing_mappings := array_append(missing_mappings, 'customer:' || coalesce(source_row.customer_code, source_row.customer_name, '(empty)')); end if;
  if mapped_location is null then missing_mappings := array_append(missing_mappings, 'location:' || coalesce(source_row.warehouse_code, '(empty)')); end if;

  target_status := case
    when lower(coalesce(source_row.order_status, '')) in ('canceled', 'cancelled', 'void', 'rejected') then 'canceled'
    when lower(coalesce(source_row.order_status, '')) in ('closed', 'close')
      or lower(coalesce(source_row.line_status, '')) in ('canceled', 'cancelled', 'closed')
      or target_quantity <= 0 then 'closed'
    else 'open'
  end;

  if target_status in ('closed', 'canceled') and target_demand_id is null then
    select demand.id into target_demand_id
    from public.planning_demand demand
    where demand.account_id = source_row.account_id and demand.source_system = 'enlearn'
      and demand.source_type = 'sales_order_line' and demand.source_key = source_row.line_id::text;
  end if;

  if target_status in ('closed', 'canceled') then
    v_sync_status := 'ignored';
    v_sync_message := case target_status
      when 'canceled' then 'Sales order or line is canceled.'
      else 'Sales order line is closed or has no open quantity.'
    end;
  elsif cardinality(missing_mappings) > 0 then
    v_sync_status := 'error';
    v_sync_message := 'Missing mappings: ' || array_to_string(missing_mappings, ', ');
  elsif target_due is null then
    v_sync_status := 'error';
    v_sync_message := 'Missing demand date.';
  elsif lower(coalesce(source_row.order_status, '')) in ('on_hold', 'hold', 'held') then
    v_sync_status := 'ignored';
    v_sync_message := 'Sales order is on hold.';
  elsif lower(coalesce(source_row.order_status, '')) not in (
    'open', 'approved', 'approve', 'passed', 'confirmed', 'processing', 'completed'
  ) then
    v_sync_status := 'pending';
    v_sync_message := 'Sales order is not approved.';
  else
    v_sync_status := 'synced';
    v_sync_message := null;
  end if;

  if v_sync_status = 'ignored' and target_status = 'open' then
    target_status := 'closed';
  end if;

  if v_sync_status = 'synced' then
    insert into public.planning_demand (
      account_id, name, owner, customer_id, item_id, location_id, due, status, quantity, priority,
      batch, source_type, source_system, source_key, source_order_id, source_line_id,
      source_doc_no, source_line_no, source_updated_at, sync_status, sync_message, source
    ) values (
      source_row.account_id, source_row.doc_no || '-' || source_row.line_no::text, source_row.doc_no,
      mapped_customer, mapped_item, mapped_location, target_due, target_status, target_quantity, 10,
      nullif(source_row.project_code, ''), 'sales_order_line', 'enlearn', source_row.line_id::text,
      source_row.order_id, source_row.line_id, source_row.doc_no, source_row.line_no::text,
      source_row.line_updated_at, 'synced', null, 'sales_order_line:' || source_row.line_id::text
    )
    on conflict (account_id, source_system, source_type, source_key) where source_key is not null
    do update set
      name = excluded.name, owner = excluded.owner, customer_id = excluded.customer_id,
      item_id = excluded.item_id, location_id = excluded.location_id, due = excluded.due,
      status = excluded.status, quantity = excluded.quantity, batch = excluded.batch,
      source_order_id = excluded.source_order_id, source_line_id = excluded.source_line_id,
      source_doc_no = excluded.source_doc_no, source_line_no = excluded.source_line_no,
      source_updated_at = excluded.source_updated_at, sync_status = 'synced', sync_message = null,
      updated_at = timezone('utc'::text, now())
    returning id into target_demand_id;
  else
    select demand.id into target_demand_id
    from public.planning_demand demand
    where demand.account_id = source_row.account_id and demand.source_system = 'enlearn'
      and demand.source_type = 'sales_order_line' and demand.source_key = source_row.line_id::text;
    if target_demand_id is not null then
      update public.planning_demand
      set sync_status = v_sync_status, sync_message = v_sync_message,
          status = case
            when target_status = 'canceled' then 'canceled'
            when v_sync_status = 'ignored' then 'closed'
            when v_sync_status = 'pending' then 'closed'
            else status
          end,
          quantity = case when v_sync_status = 'ignored' then target_quantity else quantity end,
          source_order_id = source_row.order_id, source_line_id = source_row.line_id,
          source_doc_no = source_row.doc_no, source_line_no = source_row.line_no::text,
          source_updated_at = source_row.line_updated_at, updated_at = timezone('utc'::text, now())
      where account_id = source_row.account_id and id = target_demand_id;
    end if;
  end if;

  insert into public.planning_demand_sync_state (
    account_id, source_type, source_system, source_key, source_order_id, source_line_id,
    source_doc_no, source_line_no, demand_id, status, message, source_updated_at, attempted_at, payload
  ) values (
    source_row.account_id, 'sales_order_line', 'enlearn', source_row.line_id::text,
    source_row.order_id, source_row.line_id, source_row.doc_no, source_row.line_no::text,
    target_demand_id, v_sync_status, v_sync_message, source_row.line_updated_at,
    timezone('utc'::text, now()), snapshot
  )
  on conflict (account_id, source_system, source_type, source_key) do update set
    source_order_id = excluded.source_order_id, source_line_id = excluded.source_line_id,
    source_doc_no = excluded.source_doc_no, source_line_no = excluded.source_line_no,
    demand_id = excluded.demand_id, status = excluded.status, message = excluded.message,
    source_updated_at = excluded.source_updated_at, attempted_at = excluded.attempted_at,
    payload = excluded.payload, updated_at = timezone('utc'::text, now());

  return jsonb_build_object('status', v_sync_status, 'message', v_sync_message, 'demandId', target_demand_id, 'sourceLineId', p_line_id);
end;
$function$;

alter table public.sales_orders
  drop column if exists approval_status,
  drop column if exists close_status,
  drop column if exists hold_status;

alter table public.sales_order_lines
  drop column if exists close_status;

comment on column public.sales_orders.status is
  '{"title":"订单状态","type":"enum","align":"center","description":"销售订单统一生命周期状态，可取 draft、pending、approved、rejected、on_hold、open、confirmed、processing、completed、closed 或 canceled。"}';

comment on column public.sales_order_lines.status is
  '{"title":"订单行状态","type":"enum","align":"center","description":"销售订单行统一生命周期状态，例如 open、processing、completed、closed 或 canceled。"}';

create trigger planning_sales_order_line_sync
after insert or delete or update of status, item_id, item_code, item_name, ordered_qty, open_qty,
  need_date, promise_date, delivery_date, warehouse_code, project_code
on public.sales_order_lines
for each row execute function public.planning_sync_sales_order_trigger();

create trigger planning_sales_order_sync
after delete or update of status, customer_id, customer_code, customer_name
on public.sales_orders
for each row execute function public.planning_sync_sales_order_trigger();

create or replace function pg_temp.remove_sales_order_legacy_statuses(p_value jsonb)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      if p_value ->> 'field' in ('approval_status', 'close_status', 'hold_status') then
        return null;
      end if;
      select jsonb_object_agg(entry.key, cleaned.value)
      into v_result
      from jsonb_each(p_value) entry
      cross join lateral (
        select pg_temp.remove_sales_order_legacy_statuses(entry.value) as value
      ) cleaned
      where entry.key not in ('approval_status', 'close_status', 'hold_status')
        and cleaned.value is not null;
      return coalesce(v_result, '{}'::jsonb);
    when 'array' then
      select jsonb_agg(cleaned.value order by item.ordinality)
      into v_result
      from jsonb_array_elements(p_value) with ordinality item(value, ordinality)
      cross join lateral (
        select pg_temp.remove_sales_order_legacy_statuses(item.value) as value
      ) cleaned
      where cleaned.value is not null;
      return coalesce(v_result, '[]'::jsonb);
    else
      return p_value;
  end case;
end;
$function$;

do $pages$
declare
  v_page record;
  v_next_schema jsonb;
  v_next_version integer;
begin
  for v_page in
    select id, code, version, schema
    from public.lowcode_pages
    where code in ('sales-orders', 'sales-orders-edit')
    for update
  loop
    v_next_schema := pg_temp.remove_sales_order_legacy_statuses(v_page.schema);

    if v_page.code = 'sales-orders' then
      v_next_schema := jsonb_set(
        v_next_schema,
        '{blocks,0,actions,2,directives,0,values}',
        '{"status":"open"}'::jsonb,
        false
      );
    else
      v_next_schema := jsonb_set(v_next_schema, '{blocks,1,initialValues,status}', '"draft"'::jsonb, true);
      v_next_schema := jsonb_set(
        v_next_schema,
        '{blocks,0,actions,2,script}',
        to_jsonb(replace(
          replace(
            replace(
              v_next_schema #>> '{blocks,0,actions,2,script}',
              ',''approval_status''',
              ''
            ),
            ',''close_status''',
            ''
          ),
          ',''hold_status''',
          ''
        )),
        false
      );
      v_next_schema := jsonb_set(
        v_next_schema,
        '{blocks,1,schema,fields}',
        (
          select jsonb_agg(
            case
              when field.value ->> 'field' = 'status' then
                field.value || jsonb_build_object(
                  'label', '订单状态',
                  'component', 'vxe-select',
                  'props', jsonb_build_object('clearable', true, 'placeholder', '请选择订单状态'),
                  'options', jsonb_build_array(
                    jsonb_build_object('label', '草稿', 'value', 'draft'),
                    jsonb_build_object('label', '审批中', 'value', 'pending'),
                    jsonb_build_object('label', '已批准', 'value', 'approved'),
                    jsonb_build_object('label', '已驳回', 'value', 'rejected'),
                    jsonb_build_object('label', '冻结', 'value', 'on_hold'),
                    jsonb_build_object('label', '打开', 'value', 'open'),
                    jsonb_build_object('label', '已确认', 'value', 'confirmed'),
                    jsonb_build_object('label', '执行中', 'value', 'processing'),
                    jsonb_build_object('label', '已完成', 'value', 'completed'),
                    jsonb_build_object('label', '已关闭', 'value', 'closed'),
                    jsonb_build_object('label', '已取消', 'value', 'canceled')
                  )
                )
              else field.value
            end
            order by field.ordinality
          )
          from jsonb_array_elements(v_next_schema #> '{blocks,1,schema,fields}')
            with ordinality field(value, ordinality)
        ),
        false
      );
    end if;

    if v_next_schema is distinct from v_page.schema then
      v_next_version := v_page.version + 1;
      update public.lowcode_pages
      set schema = v_next_schema,
          version = v_next_version,
          updated_at = timezone('utc'::text, now())
      where id = v_page.id;

      insert into public.lowcode_page_versions (page_id, version, schema, published_at)
      values (v_page.id, v_next_version, v_next_schema, timezone('utc'::text, now()))
      on conflict (page_id, version) do update set
        schema = excluded.schema,
        published_at = excluded.published_at;
    end if;
  end loop;
end;
$pages$;

do $validation$
declare
  v_legacy_columns integer;
  v_page_references integer;
begin
  select count(*) into v_legacy_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('sales_orders', 'sales_order_lines')
    and column_name in ('approval_status', 'close_status', 'hold_status');

  select count(*) into v_page_references
  from public.lowcode_pages
  where code in ('sales-orders', 'sales-orders-edit')
    and schema::text ~ 'approval_status|close_status|hold_status';

  if v_legacy_columns <> 0 or v_page_references <> 0 then
    raise exception 'Sales-order status unification failed: columns %, page references %.',
      v_legacy_columns, v_page_references;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
