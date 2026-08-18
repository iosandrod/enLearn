-- Delete workflow Jobs only after the API has removed their Trigger.dev schedule.

create or replace function public.workflow_delete_job(
  p_account_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_job public.wf_job%rowtype;
begin
  if p_account_id is null or p_job_id is null then
    raise exception 'account_id and job_id are required.' using errcode = '22023';
  end if;

  delete from public.wf_job
  where id = p_job_id
    and account_id = p_account_id
  returning * into v_job;

  if not found then
    return null;
  end if;
  return to_jsonb(v_job);
end;
$function$;

revoke all on function public.workflow_delete_job(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.workflow_delete_job(uuid, uuid)
  to service_role;
