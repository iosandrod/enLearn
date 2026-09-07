-- Notification API multi-row writes. Provider dispatch remains in the worker;
-- message-center writes are atomic and exposed only through this RPC.

create or replace function public.notification_api_command(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_account_id uuid := nullif(v_payload->>'account_id', '')::uuid;
  v_recipient_id uuid := nullif(v_payload->>'recipient_id', '')::uuid;
  v_actor_id uuid := nullif(v_payload->>'actor_id', '')::uuid;
  v_notice_id text := nullif(btrim(v_payload->>'notice_id'), '');
  v_event public.notification_events%rowtype;
  v_messages jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v_payload) <> 'object' or v_account_id is null then
    raise exception 'notification_api_command requires an object payload and account_id.' using errcode = '22023';
  end if;

  if v_action = 'mark_read' then
    if v_recipient_id is null then
      raise exception 'recipient_id is required.' using errcode = '22023';
    end if;
    with updated as (
      update public.notification_messages messages
      set read_at = timezone('utc'::text, now())
      where messages.account_id = v_account_id
        and messages.recipient_id = v_recipient_id
        and messages.read_at is null
        and messages.archived_at is null
        and (
          jsonb_typeof(v_payload->'ids') <> 'array'
          or jsonb_array_length(v_payload->'ids') = 0
          or messages.id::text in (select value from jsonb_array_elements_text(v_payload->'ids'))
        )
        and (nullif(v_payload->>'category', '') is null or messages.category = v_payload->>'category')
      returning messages.*
    )
    select coalesce(jsonb_agg(to_jsonb(updated) order by updated.created_at desc), '[]'::jsonb)
    into v_messages from updated;
    return v_messages;
  end if;

  if v_action = 'create_system_notice' then
    if v_notice_id is null
       or nullif(btrim(v_payload->>'title'), '') is null
       or jsonb_typeof(v_payload->'recipient_ids') <> 'array' then
      raise exception 'notice_id, title, and recipient_ids are required.' using errcode = '22023';
    end if;

    insert into public.notification_events (
      account_id, event_type, source_type, source_id, actor_id, payload,
      idempotency_key, status, processed_at
    ) values (
      v_account_id, 'system.notice.created', 'system_notice', v_notice_id, v_actor_id,
      case when jsonb_typeof(v_payload->'event_payload') = 'object'
        then v_payload->'event_payload' else '{}'::jsonb end,
      'system-notice:' || v_notice_id, 'processed', timezone('utc'::text, now())
    )
    on conflict (account_id, idempotency_key) do update set
      actor_id = excluded.actor_id,
      payload = excluded.payload,
      status = 'processed',
      error_message = null,
      processed_at = excluded.processed_at
    returning * into v_event;

    with recipients as (
      select distinct value::uuid as recipient_id
      from jsonb_array_elements_text(v_payload->'recipient_ids')
      where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ), saved as (
      insert into public.notification_messages (
        account_id, event_id, recipient_id, category, channel, title, content,
        link_url, priority, source_type, source_id, metadata
      )
      select
        v_account_id, v_event.id, recipients.recipient_id, 'system', 'inbox',
        btrim(v_payload->>'title'), coalesce(v_payload->>'content', ''),
        nullif(v_payload->>'link_url', ''),
        case when v_payload->>'priority' in ('low','normal','high','urgent')
          then v_payload->>'priority' else 'normal' end,
        'system_notice', v_notice_id,
        case when jsonb_typeof(v_payload->'metadata') = 'object'
          then v_payload->'metadata' else '{}'::jsonb end
      from recipients
      join basejump.account_user memberships
        on memberships.account_id = v_account_id
       and memberships.user_id = recipients.recipient_id
      on conflict (account_id, recipient_id, source_type, source_id, category) do update set
        event_id = excluded.event_id,
        title = excluded.title,
        content = excluded.content,
        link_url = excluded.link_url,
        priority = excluded.priority,
        metadata = excluded.metadata
      returning notification_messages.*
    )
    select coalesce(jsonb_agg(to_jsonb(saved) order by saved.created_at), '[]'::jsonb)
    into v_messages from saved;

    return jsonb_build_object('event', to_jsonb(v_event), 'messages', v_messages);
  end if;

  raise exception 'Unsupported notification API action: %.', coalesce(p_action, '') using errcode = '22023';
end;
$function$;

revoke all on function public.notification_api_command(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.notification_api_command(text, jsonb)
  to service_role;

