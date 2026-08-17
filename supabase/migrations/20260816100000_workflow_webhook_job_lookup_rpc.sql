-- Resolve an enabled typed Trigger workflow Job by its Webhook service route.
-- The API domain services use this RPC before falling back to workflow execution.

create or replace function public.find_workflow_webhook_job(
  p_account_id uuid,
  p_service_name text,
  p_service_method text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select to_jsonb(job_row)
  from (
    select
      jobs.id,
      jobs.account_id,
      jobs.code,
      jobs.name,
      jobs.status,
      jobs.trigger_task_id
    from public.wf_job jobs
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(jobs.payload #> '{triggerWorkflow,executionPlan,operations}') = 'array'
          then jobs.payload #> '{triggerWorkflow,executionPlan,operations}'
        else '[]'::jsonb
      end
    ) as operations(operation)
    where jobs.account_id = p_account_id
      and jobs.status = 'enabled'
      and jobs.trigger_task_id = 'workflow.trigger-workflow.run'
      and operations.operation->>'type' = 'webhook'
      and nullif(btrim(operations.operation #>> '{options,body,serviceName}'), '') =
        nullif(btrim(p_service_name), '')
      and nullif(btrim(operations.operation #>> '{options,body,serviceMethod}'), '') =
        nullif(btrim(p_service_method), '')
    order by jobs.updated_at desc, jobs.id desc
    limit 1
  ) as job_row;
$function$;

revoke all on function public.find_workflow_webhook_job(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.find_workflow_webhook_job(uuid, text, text)
  to service_role;
