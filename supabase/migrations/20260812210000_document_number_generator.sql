-- Add an account-scoped, configurable, concurrency-safe document number generator.

begin;

do $create_document_number_rules$
begin
if to_regclass('public.document_number_rules') is null then
create table public.document_number_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  code text not null,
  name text not null,
  prefix text not null default '',
  suffix text not null default '',
  number_format text not null default '{PREFIX}{DATE}{SERIAL}{SUFFIX}',
  date_pattern text not null default 'YYYYMMDD',
  serial_width smallint not null default 6,
  reset_period text not null default 'daily',
  start_value bigint not null default 1,
  increment_by bigint not null default 1,
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint document_number_rules_account_code_key unique (account_id, code),
  constraint document_number_rules_id_account_key unique (id, account_id),
  constraint document_number_rules_code_check
    check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'),
  constraint document_number_rules_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint document_number_rules_prefix_check
    check (char_length(prefix) <= 40),
  constraint document_number_rules_suffix_check
    check (char_length(suffix) <= 40),
  constraint document_number_rules_format_check
    check (
      char_length(number_format) between 1 and 256
      and position('{SERIAL}' in number_format) > 0
    ),
  constraint document_number_rules_date_pattern_check
    check (char_length(date_pattern) <= 64),
  constraint document_number_rules_serial_width_check
    check (serial_width between 1 and 18),
  constraint document_number_rules_reset_period_check
    check (reset_period in ('never', 'yearly', 'monthly', 'daily')),
  constraint document_number_rules_reset_format_check
    check (
      reset_period = 'never'
      or (
        char_length(date_pattern) > 0
        and position('{DATE}' in number_format) > 0
      )
    ),
  constraint document_number_rules_start_value_check check (start_value > 0),
  constraint document_number_rules_increment_check check (increment_by > 0)
);
end if;
end;
$create_document_number_rules$;

create unique index if not exists document_number_rules_one_active_default
  on public.document_number_rules (account_id)
  where is_default and enabled;

create index if not exists document_number_rules_account_enabled_idx
  on public.document_number_rules (account_id, enabled, code);

do $create_document_number_counters$
begin
if to_regclass('public.document_number_counters') is null then
create table public.document_number_counters (
  rule_id uuid not null,
  account_id uuid not null,
  period_key text not null,
  last_value bigint not null,
  last_business_date date not null,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (rule_id, period_key),
  constraint document_number_counters_rule_account_fkey
    foreign key (rule_id, account_id)
    references public.document_number_rules(id, account_id)
    on delete cascade,
  constraint document_number_counters_period_key_check
    check (char_length(period_key) between 1 and 32),
  constraint document_number_counters_last_value_check check (last_value > 0)
);
end if;
end;
$create_document_number_counters$;

create index if not exists document_number_counters_account_idx
  on public.document_number_counters (account_id, updated_at desc);

do $create_document_number_allocations$
begin
if to_regclass('public.document_number_allocations') is null then
create table public.document_number_allocations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  rule_id uuid not null,
  period_key text not null,
  sequence_value bigint not null,
  business_date date not null,
  document_number text not null,
  generated_by uuid references auth.users(id) on delete set null,
  block_id text,
  field_name text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint document_number_allocations_rule_account_fkey
    foreign key (rule_id, account_id)
    references public.document_number_rules(id, account_id)
    on delete cascade,
  constraint document_number_allocations_sequence_key
    unique (rule_id, period_key, sequence_value),
  constraint document_number_allocations_account_number_key
    unique (account_id, document_number),
  constraint document_number_allocations_number_check
    check (char_length(document_number) between 1 and 128)
);
end if;
end;
$create_document_number_allocations$;

create index if not exists document_number_allocations_account_created_idx
  on public.document_number_allocations (account_id, created_at desc);

create or replace function public.normalize_document_number_rule()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.prefix := btrim(new.prefix);
  new.suffix := btrim(new.suffix);
  new.number_format := btrim(new.number_format);
  new.date_pattern := btrim(new.date_pattern);
  new.updated_at := timezone('utc'::text, now());
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, timezone('utc'::text, now()));
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_document_number_rule
  on public.document_number_rules;
create trigger normalize_document_number_rule
before insert or update on public.document_number_rules
for each row execute function public.normalize_document_number_rule();

alter table public.document_number_rules enable row level security;
alter table public.document_number_counters enable row level security;
alter table public.document_number_allocations enable row level security;

revoke all on table public.document_number_rules
  from public, anon, authenticated, service_role;
revoke all on table public.document_number_counters
  from public, anon, authenticated, service_role;
revoke all on table public.document_number_allocations
  from public, anon, authenticated, service_role;
grant select on table public.document_number_rules to authenticated;
grant select on table public.document_number_allocations to authenticated;
grant all on table public.document_number_rules to service_role;
grant all on table public.document_number_counters to service_role;
grant all on table public.document_number_allocations to service_role;

drop policy if exists "Account members can read document number rules"
  on public.document_number_rules;
create policy "Account members can read document number rules"
on public.document_number_rules for select to authenticated
using (public.is_active_account_member(account_id));

drop policy if exists "Account members can read document number allocations"
  on public.document_number_allocations;
create policy "Account members can read document number allocations"
on public.document_number_allocations for select to authenticated
using (public.is_active_account_member(account_id));

create or replace function public.seed_default_document_number_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.personal_account then
    return new;
  end if;

  insert into public.document_number_rules (
    account_id, code, name, prefix, number_format, date_pattern,
    serial_width, reset_period, start_value, increment_by, is_default
  ) values
    (
      new.id, 'DEFAULT', 'Generic document number', 'DOC',
      '{PREFIX}{DATE}{SERIAL}{SUFFIX}', 'YYYYMMDD',
      6, 'daily', 1, 1, true
    ),
    (
      new.id, 'STD-SO', 'Standard sales order', 'SO',
      '{PREFIX}{DATE}{SERIAL}{SUFFIX}', 'YYYYMMDD',
      4, 'daily', 1, 1, false
    )
  on conflict (account_id, code) do nothing;

  return new;
end;
$function$;

drop trigger if exists seed_default_document_number_rules
  on basejump.accounts;
create trigger seed_default_document_number_rules
after insert on basejump.accounts
for each row execute function public.seed_default_document_number_rules();

insert into public.document_number_rules (
  account_id, code, name, prefix, number_format, date_pattern,
  serial_width, reset_period, start_value, increment_by, is_default
)
select
  accounts.id,
  rules.code,
  rules.name,
  rules.prefix,
  '{PREFIX}{DATE}{SERIAL}{SUFFIX}',
  'YYYYMMDD',
  rules.serial_width,
  'daily',
  1,
  1,
  rules.is_default
from basejump.accounts accounts
cross join (
  values
    ('DEFAULT'::text, 'Generic document number'::text, 'DOC'::text, 6::smallint, true),
    ('STD-SO'::text, 'Standard sales order'::text, 'SO'::text, 4::smallint, false)
) rules(code, name, prefix, serial_width, is_default)
where not accounts.personal_account
on conflict (account_id, code) do nothing;

create or replace function public.generate_document_number(
  p_context jsonb default '{}'::jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, basejump
as $function$
declare
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_values jsonb := '{}'::jsonb;
  v_account_id uuid;
  v_account_code text;
  v_timezone text;
  v_rule public.document_number_rules%rowtype;
  v_rule_code text;
  v_date_text text;
  v_business_date date;
  v_period_key text;
  v_date_part text;
  v_next_value bigint;
  v_serial_part text;
  v_number text;
begin
  if jsonb_typeof(v_context) <> 'object' then
    raise exception 'Document number context must be a JSON object.'
      using errcode = '22023';
  end if;

  begin
    v_account_id := coalesce(
      nullif(btrim(v_context->>'accountId'), ''),
      nullif(btrim(v_context->>'account_id'), '')
    )::uuid;
  exception
    when invalid_text_representation then
      v_account_id := null;
  end;
  if v_account_id is null then
    raise exception 'A valid accountId is required to generate a document number.'
      using errcode = '22023';
  end if;
  if not public.is_active_account_member(v_account_id) then
    raise exception 'Active account membership is required to generate a document number.'
      using errcode = '42501';
  end if;

  select accounts.code, accounts.timezone
  into v_account_code, v_timezone
  from basejump.accounts accounts
  where accounts.id = v_account_id
    and accounts.status = 'active';

  if not found then
    raise exception 'The selected account is not active.' using errcode = '42501';
  end if;

  if jsonb_typeof(v_context->'values') = 'object' then
    v_values := v_context->'values';
  end if;

  v_rule_code := upper(btrim(coalesce(
    nullif(v_context->>'ruleCode', ''),
    nullif(v_context->>'rule_code', ''),
    nullif(v_values->>'document_number_rule_code', ''),
    nullif(v_values->>'doc_type_code', ''),
    ''
  )));

  if v_rule_code <> '' then
    select rules.*
    into v_rule
    from public.document_number_rules rules
    where rules.account_id = v_account_id
      and rules.code = v_rule_code
      and rules.enabled;
  else
    select rules.*
    into v_rule
    from public.document_number_rules rules
    where rules.account_id = v_account_id
      and rules.is_default
      and rules.enabled
    order by rules.code
    limit 1;
  end if;

  if not found then
    raise exception 'Document number rule "%" was not found for the selected account.',
      coalesce(nullif(v_rule_code, ''), '<default>')
      using errcode = 'P0002';
  end if;

  v_date_text := coalesce(
    nullif(btrim(v_context->>'businessDate'), ''),
    nullif(btrim(v_context->>'business_date'), ''),
    nullif(btrim(v_values->>'business_date'), ''),
    nullif(btrim(v_values->>'doc_date'), '')
  );

  if v_date_text is not null then
    begin
      v_business_date := case
        when v_date_text ~ '^\d{4}-\d{2}-\d{2}'
          then substring(v_date_text from 1 for 10)::date
        else v_date_text::date
      end;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Invalid document business date: %.', v_date_text
          using errcode = '22007';
    end;
  else
    begin
      v_business_date := (current_timestamp at time zone v_timezone)::date;
    exception
      when invalid_parameter_value then
        raise exception 'Invalid account timezone: %.', v_timezone
          using errcode = '22023';
    end;
  end if;

  v_period_key := case v_rule.reset_period
    when 'never' then 'all'
    when 'yearly' then to_char(v_business_date::timestamp, 'YYYY')
    when 'monthly' then to_char(v_business_date::timestamp, 'YYYYMM')
    when 'daily' then to_char(v_business_date::timestamp, 'YYYYMMDD')
  end;
  v_date_part := case
    when v_rule.date_pattern = '' then ''
    else to_char(v_business_date::timestamp, v_rule.date_pattern)
  end;

  insert into public.document_number_counters as counters (
    rule_id,
    account_id,
    period_key,
    last_value,
    last_business_date,
    updated_at
  ) values (
    v_rule.id,
    v_account_id,
    v_period_key,
    v_rule.start_value,
    v_business_date,
    timezone('utc'::text, now())
  )
  on conflict (rule_id, period_key) do update set
    last_value = counters.last_value + v_rule.increment_by,
    last_business_date = excluded.last_business_date,
    updated_at = excluded.updated_at
  returning last_value into v_next_value;

  if char_length(v_next_value::text) > v_rule.serial_width then
    raise exception 'Document number sequence for rule "%" exceeds serial width %.',
      v_rule.code, v_rule.serial_width
      using errcode = '22003';
  end if;

  v_serial_part := lpad(v_next_value::text, v_rule.serial_width, '0');
  v_number := v_rule.number_format;
  v_number := replace(v_number, '{DATE}', v_date_part);
  v_number := replace(v_number, '{SERIAL}', v_serial_part);
  v_number := replace(v_number, '{ACCOUNT}', coalesce(v_account_code, ''));
  v_number := replace(v_number, '{RULE}', v_rule.code);
  v_number := replace(v_number, '{PREFIX}', v_rule.prefix);
  v_number := replace(v_number, '{SUFFIX}', v_rule.suffix);
  v_number := btrim(v_number);

  if v_number = '' then
    raise exception 'Document number rule "%" produced an empty number.', v_rule.code
      using errcode = '22023';
  end if;
  if v_number ~ '\{[A-Z][A-Z0-9_]*\}' then
    raise exception 'Document number rule "%" contains an unsupported placeholder: %.',
      v_rule.code, v_number
      using errcode = '22023';
  end if;
  if char_length(v_number) > 128 then
    raise exception 'Generated document number exceeds 128 characters.'
      using errcode = '22001';
  end if;

  begin
    insert into public.document_number_allocations (
      account_id,
      rule_id,
      period_key,
      sequence_value,
      business_date,
      document_number,
      generated_by,
      block_id,
      field_name
    ) values (
      v_account_id,
      v_rule.id,
      v_period_key,
      v_next_value,
      v_business_date,
      v_number,
      auth.uid(),
      nullif(btrim(v_context->>'blockId'), ''),
      nullif(btrim(v_context->>'field'), '')
    );
  exception
    when unique_violation then
      raise exception 'Generated document number "%" already exists in this account.',
        v_number
        using errcode = '23505';
  end;

  return v_number;
end;
$function$;

comment on function public.generate_document_number(jsonb) is
  'Low-code default value: generates an account-scoped document number from JSON context.';

revoke all on function public.generate_document_number(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.generate_document_number(jsonb)
  to authenticated, service_role;

create or replace function public.read_lowcode_default_value_procedure(
  p_action text,
  p_procedure text,
  p_context jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_procedure text := btrim(coalesce(p_procedure, ''));
  v_parts text[];
  v_schema_name text;
  v_procedure_name text;
  v_oid oid;
  v_arg_count integer;
  v_result jsonb;
begin
  if v_action = 'list' then
    if not (
      public.has_app_permission('lowcode.pages.manage')
      or public.has_app_permission('admin.entities.manage')
    ) then
      raise exception 'Low-code page permission required.' using errcode = '42501';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'value', routines.schema_name || '.' || routines.procedure_name,
          'label', routines.procedure_name ||
            case when routines.arg_count = 1 then '(context)' else '' end ||
            ' (' || routines.return_type || ')'
        )
        order by routines.schema_name, routines.procedure_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select distinct on (namespaces.nspname, procedures.proname)
        namespaces.nspname as schema_name,
        procedures.proname as procedure_name,
        procedures.pronargs::integer as arg_count,
        pg_catalog.format_type(procedures.prorettype, null) as return_type
      from pg_catalog.pg_proc procedures
      join pg_catalog.pg_namespace namespaces
        on namespaces.oid = procedures.pronamespace
      join pg_catalog.pg_type return_types
        on return_types.oid = procedures.prorettype
      where namespaces.nspname = 'public'
        and procedures.prokind = 'f'
        and (
          procedures.pronargs = 0
          or (
            procedures.pronargs = 1
            and procedures.proargtypes[0] = 'pg_catalog.jsonb'::pg_catalog.regtype::oid
            and procedures.proname in ('generate_document_number')
          )
        )
        and procedures.proretset = false
        and procedures.prorettype <> 'pg_catalog.void'::pg_catalog.regtype
        and return_types.typtype <> 'p'
        and pg_catalog.has_function_privilege(current_user, procedures.oid, 'EXECUTE')
        and procedures.proname not in (
          'read_lowcode_default_value_procedure',
          'create_default_system_config',
          'handle_new_user'
        )
      order by
        namespaces.nspname,
        procedures.proname,
        procedures.pronargs desc,
        procedures.oid
    ) routines;

    return v_result;
  end if;

  if v_action <> 'execute' then
    raise exception 'Unsupported default-value procedure action: %.', p_action
      using errcode = '22023';
  end if;

  v_parts := pg_catalog.parse_ident(v_procedure, true);
  if coalesce(array_length(v_parts, 1), 0) = 1 then
    v_schema_name := 'public';
    v_procedure_name := v_parts[1];
  elsif array_length(v_parts, 1) = 2 then
    v_schema_name := v_parts[1];
    v_procedure_name := v_parts[2];
  else
    raise exception 'Procedure name must be public.name.' using errcode = '22023';
  end if;

  if v_schema_name <> 'public' then
    raise exception 'Only public procedures can provide field default values.'
      using errcode = '42501';
  end if;

  select procedures.oid, procedures.pronargs::integer
  into v_oid, v_arg_count
  from pg_catalog.pg_proc procedures
  join pg_catalog.pg_namespace namespaces
    on namespaces.oid = procedures.pronamespace
  join pg_catalog.pg_type return_types
    on return_types.oid = procedures.prorettype
  where namespaces.nspname = v_schema_name
    and procedures.proname = v_procedure_name
    and procedures.prokind = 'f'
    and (
      procedures.pronargs = 0
      or (
        procedures.pronargs = 1
        and procedures.proargtypes[0] = 'pg_catalog.jsonb'::pg_catalog.regtype::oid
        and procedures.proname in ('generate_document_number')
      )
    )
    and procedures.proretset = false
    and procedures.prorettype <> 'pg_catalog.void'::pg_catalog.regtype
    and return_types.typtype <> 'p'
    and procedures.proname not in (
      'read_lowcode_default_value_procedure',
      'create_default_system_config',
      'handle_new_user'
    )
  order by procedures.pronargs desc, procedures.oid
  limit 1;

  if v_oid is null then
    raise exception 'Default-value procedure "%" was not found.', v_procedure
      using errcode = 'P0002';
  end if;
  if not pg_catalog.has_function_privilege(current_user, v_oid, 'EXECUTE') then
    raise exception 'Execute permission is required for procedure "%".', v_procedure
      using errcode = '42501';
  end if;

  if v_arg_count = 1 then
    execute pg_catalog.format(
      'select pg_catalog.to_jsonb(%I.%I($1::pg_catalog.jsonb))',
      v_schema_name,
      v_procedure_name
    ) into v_result using coalesce(p_context, '{}'::jsonb);
  else
    execute pg_catalog.format(
      'select pg_catalog.to_jsonb(%I.%I())',
      v_schema_name,
      v_procedure_name
    ) into v_result;
  end if;

  return v_result;
end;
$function$;

create or replace function public.read_lowcode_default_value_procedure(
  p_action text,
  p_procedure text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
  select public.read_lowcode_default_value_procedure(
    p_action,
    p_procedure,
    '{}'::jsonb
  );
$function$;

revoke all on function public.read_lowcode_default_value_procedure(text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.read_lowcode_default_value_procedure(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_lowcode_default_value_procedure(text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.read_lowcode_default_value_procedure(text, text)
  to authenticated, service_role;

create or replace function pg_temp.patch_sales_order_document_number(value jsonb)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb := value;
  v_initial_values jsonb;
begin
  if value is null then
    return value;
  end if;

  if jsonb_typeof(value) = 'array' then
    select coalesce(
      jsonb_agg(pg_temp.patch_sales_order_document_number(entry.item) order by entry.ordinality),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(value) with ordinality as entry(item, ordinality);
    return v_result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  select coalesce(
    jsonb_object_agg(entry.key, pg_temp.patch_sales_order_document_number(entry.item)),
    '{}'::jsonb
  )
  into v_result
  from jsonb_each(value) as entry(key, item);

  if v_result->>'field' = 'doc_no' and v_result ? 'component' then
    v_result := (v_result - 'defaultValueScript') || jsonb_build_object(
      'defaultValueType', 'procedure',
      'defaultValueProcedure', 'public.generate_document_number'
    );
  end if;

  if v_result->>'id' = 'sales-order-edit-form' and v_result->>'kind' = 'form' then
    v_initial_values := coalesce(v_result->'initialValues', '{}'::jsonb) - 'doc_no';
    v_result := jsonb_set(v_result, '{initialValues}', v_initial_values, true);
  end if;

  if v_result#>>'{props,blockId}' = 'sales-order-edit-form'
    and jsonb_typeof(v_result#>'{props,initialValuesJson}') = 'string'
  then
    begin
      v_initial_values := coalesce(
        (v_result#>>'{props,initialValuesJson}')::jsonb,
        '{}'::jsonb
      ) - 'doc_no';
      v_result := jsonb_set(
        v_result,
        '{props,initialValuesJson}',
        to_jsonb(v_initial_values::text),
        false
      );
    exception
      when invalid_text_representation then
        raise exception 'Sales-order visual initialValuesJson is invalid JSON.';
    end;
  end if;

  return v_result;
end;
$function$;

do $update_page$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;

  v_next_schema := pg_temp.patch_sales_order_document_number(v_schema);

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      schema = v_next_schema,
      version = v_version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    where id = v_page_id
    returning version into v_version;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    select id, version, schema, published_at
    from public.lowcode_pages
    where id = v_page_id
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end;
$update_page$;

do $validation$
declare
  v_field jsonb;
  v_initial_values jsonb;
begin
  if to_regclass('public.document_number_rules') is null
    or to_regclass('public.document_number_counters') is null
    or to_regclass('public.document_number_allocations') is null
    or to_regprocedure('public.generate_document_number(jsonb)') is null
    or to_regprocedure(
      'public.read_lowcode_default_value_procedure(text,text,jsonb)'
    ) is null
  then
    raise exception 'Document number database objects were not created.';
  end if;

  select field_item, block_item->'initialValues'
  into v_field, v_initial_values
  from public.lowcode_pages pages,
    lateral jsonb_array_elements(pages.schema->'blocks') block_item,
    lateral jsonb_array_elements(block_item->'schema'->'fields') field_item
  where pages.code = 'sales-orders-edit'
    and block_item->>'id' = 'sales-order-edit-form'
    and field_item->>'field' = 'doc_no';

  if v_field->>'defaultValueType' <> 'procedure'
    or v_field->>'defaultValueProcedure' <> 'public.generate_document_number'
    or coalesce(v_initial_values ? 'doc_no', false)
  then
    raise exception 'Sales-order document number default validation failed: field %, initial values %.',
      v_field, v_initial_values;
  end if;
end;
$validation$;

drop function pg_temp.patch_sales_order_document_number(jsonb);

select pg_notify('pgrst', 'reload schema');

commit;
