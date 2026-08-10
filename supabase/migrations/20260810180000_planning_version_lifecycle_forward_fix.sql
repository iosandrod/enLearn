-- Forward-only deployment of the plan-version lifecycle fix.
-- This intentionally duplicates the corrected definitions from the generated
-- planning migrations so databases that already recorded those migrations
-- receive the published -> superseded behavior without replaying old files.

begin;

create or replace function public.planning_guard_plan_version()
returns trigger
language plpgsql
as $function$
declare
  system_write boolean := coalesce(current_setting('planning.system_version_write', true), '') = 'on';
begin
  if tg_op = 'INSERT' and not system_write then
    new.status := 'draft';
    new.is_current := false;
    new.started_at := null;
    new.completed_at := null;
    new.published_at := null;
    new.published_by := null;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not system_write
       and current_setting('planning.publish_version_id', true) is distinct from new.id::text then
      raise exception 'Plan version status is maintained by the planning execution lifecycle.' using errcode = '42501';
    end if;
    if not (
      (old.status = 'draft' and new.status in ('running', 'completed', 'failed', 'canceled'))
      or (old.status = 'running' and new.status in ('completed', 'failed', 'canceled'))
      or (old.status = 'completed' and new.status in ('published', 'failed', 'canceled'))
      or (old.status = 'published' and new.status = 'superseded')
    ) then
      raise exception 'Invalid plan version status transition: % -> %.', old.status, new.status using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and old.status not in ('published', 'superseded') then
    new.is_current := old.is_current;
  end if;

  if tg_op = 'UPDATE' and not system_write
     and current_setting('planning.publish_version_id', true) is distinct from new.id::text
     and (
       new.is_current is distinct from old.is_current
       or new.result_summary is distinct from old.result_summary
       or new.started_at is distinct from old.started_at
       or new.completed_at is distinct from old.completed_at
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by
     ) then
    raise exception 'Plan version execution fields are system maintained.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.status in ('published', 'superseded') then
    if new.code is distinct from old.code
       or new.scenario_id is distinct from old.scenario_id
       or new.run_id is distinct from old.run_id
       or new.parent_version_id is distinct from old.parent_version_id
       or new.version_no is distinct from old.version_no
       or new.input_cutoff is distinct from old.input_cutoff
       or new.horizon_start is distinct from old.horizon_start
       or new.horizon_end is distinct from old.horizon_end
       or new.solver is distinct from old.solver
       or new.parameters is distinct from old.parameters
       or new.input_snapshot is distinct from old.input_snapshot then
      raise exception 'Published or superseded plan versions are immutable.' using errcode = '23514';
    end if;
  end if;

  if new.status = 'published' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      if current_setting('planning.publish_version_id', true) is distinct from new.id::text then
        raise exception 'Use planning_publish_plan_version to publish a plan version.' using errcode = '42501';
      end if;
      if new.completed_at is null then
        raise exception 'Only a completed plan version can be published.' using errcode = '23514';
      end if;
      perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.scenario_id::text || ':publish', 0));
      perform set_config('planning.system_version_write', 'on', true);
      update public.planning_plan_version
      set status = 'superseded', is_current = false, updated_at = timezone('utc'::text, now())
      where account_id = new.account_id
        and scenario_id = new.scenario_id
        and id <> new.id
        and is_current;
      new.is_current := true;
      new.published_at := coalesce(new.published_at, timezone('utc'::text, now()));
      new.published_by := coalesce(new.published_by, auth.uid());
    elsif new.is_current is distinct from old.is_current
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by then
      raise exception 'Published plan version metadata is immutable.' using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    new.is_current := false;
  end if;

  return new;
end;
$function$;

create or replace function public.planning_guard_terminal_version()
returns trigger
language plpgsql
as $function$
declare
  system_write boolean := coalesce(current_setting('planning.system_version_write', true), '') = 'on';
begin
  if old.status = 'canceled' then
    raise exception 'Canceled plan versions are immutable.' using errcode = '23514';
  end if;
  if old.status = 'superseded' then
    raise exception 'Superseded plan versions are immutable.' using errcode = '23514';
  end if;
  if old.status = 'published' then
    if not (system_write and new.status = 'superseded') then
      raise exception 'Published plan versions are immutable.' using errcode = '23514';
    end if;
    if (to_jsonb(new) - 'status' - 'is_current' - 'updated_at' - 'lastmodified'
                      - 'published_at' - 'published_by')
       is distinct from
       (to_jsonb(old) - 'status' - 'is_current' - 'updated_at' - 'lastmodified'
                      - 'published_at' - 'published_by') then
      raise exception 'Published plan version content is immutable.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.planning_publish_plan_version(p_account_id uuid, p_version_id uuid)
returns public.planning_plan_version
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  version_row public.planning_plan_version;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from basejump.account_user membership
    where membership.account_id = p_account_id and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;

  select * into version_row
  from public.planning_plan_version
  where account_id = p_account_id and id = p_version_id
  for update;
  if not found then
    raise exception 'Plan version not found.' using errcode = 'P0002';
  end if;
  if version_row.status <> 'completed' then
    raise exception 'Only a completed plan version can be published.' using errcode = '23514';
  end if;

  perform set_config('planning.publish_version_id', p_version_id::text, true);
  perform set_config('planning.system_version_write', 'on', true);
  update public.planning_plan_version
  set status = 'published', published_by = coalesce(auth.uid(), published_by)
  where account_id = p_account_id and id = p_version_id
  returning * into version_row;
  perform set_config('planning.publish_version_id', '', true);
  perform set_config('planning.system_version_write', '', true);
  return version_row;
end;
$function$;

revoke all on function public.planning_publish_plan_version(uuid, uuid) from public, anon;
grant execute on function public.planning_publish_plan_version(uuid, uuid) to authenticated, service_role;

commit;
