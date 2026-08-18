-- Notification worker persistence boundary. Message/delivery preparation and
-- claims are transactional; provider HTTP calls remain in TypeScript.

create or replace function public.notification_worker_category(p_event_type text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when p_event_type like 'approval.%' then 'approval'
    when p_event_type like 'mention.%' then 'mention'
    when p_event_type like 'security.%' then 'security'
    when p_event_type like 'business.%' then 'business'
    else 'system'
  end
$function$;

create or replace function public.notification_worker_json_path(p_value jsonb, p_path text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_value jsonb := p_value;
  v_key text;
begin
  foreach v_key in array string_to_array(coalesce(p_path, ''), '.')
  loop
    if jsonb_typeof(v_value) <> 'object' then return ''; end if;
    v_value := v_value->v_key;
    if v_value is null then return ''; end if;
  end loop;
  if jsonb_typeof(v_value) = 'string' then return v_value#>>'{}'; end if;
  return trim(both '"' from coalesce(v_value::text, ''));
end;
$function$;

create or replace function public.notification_worker_render(p_template text, p_payload jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_result text := coalesce(p_template, '');
  v_match text[];
begin
  for v_match in
    select regexp_matches(v_result, '(\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\})', 'g')
  loop
    v_result := replace(
      v_result,
      v_match[1],
      public.notification_worker_json_path(coalesce(p_payload, '{}'::jsonb), v_match[2])
    );
  end loop;
  return v_result;
end;
$function$;

create or replace function public.notification_worker_template(p_event_type text, p_channel text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_template public.notification_templates%rowtype;
begin
  select * into v_template
  from public.notification_templates
  where event_type = p_event_type
    and channel = p_channel
    and status = 'active'
  order by updated_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'code', v_template.code,
      'title_template', v_template.title_template,
      'content_template', v_template.content_template
    );
  end if;
  return jsonb_build_object(
    'code', 'fallback_' || p_channel,
    'title_template', '{{title}}',
    'content_template', '{{content}}'
  );
end;
$function$;

create or replace function public.notification_worker_command(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, basejump
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_event_input jsonb;
  v_event public.notification_events%rowtype;
  v_message public.notification_messages%rowtype;
  v_delivery public.notification_deliveries%rowtype;
  v_joined record;
  v_contact record;
  v_preference public.notification_preferences%rowtype;
  v_preference_found boolean;
  v_account_id uuid;
  v_event_id uuid;
  v_message_id uuid;
  v_delivery_id uuid;
  v_recipient_id uuid;
  v_category text;
  v_channel text;
  v_target text;
  v_template jsonb;
  v_recipient_ids uuid[] := array[]::uuid[];
  v_recipient_text text;
  v_message_ids jsonb := '[]'::jsonb;
  v_delivery_ids jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_message_count integer := 0;
  v_delivery_count integer := 0;
  v_attempt integer;
  v_limit integer;
  v_archive_days integer;
  v_delete_days integer;
  v_archived integer;
  v_deleted integer;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'notification_worker_command payload must be an object.' using errcode = '22023';
  end if;

  if v_action = 'prepare_dispatch' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_event_id := nullif(v_payload->>'event_id', '')::uuid;
    v_event_input := v_payload->'event';

    if v_event_id is null then
      if jsonb_typeof(v_event_input) <> 'object' then
        raise exception 'event_id or event is required.' using errcode = '22023';
      end if;
      v_account_id := coalesce(v_account_id, nullif(v_event_input->>'account_id', '')::uuid);
      if v_account_id is null then
        raise exception 'Notification event account_id is required.' using errcode = '22023';
      end if;
      insert into public.notification_events (
        account_id, event_type, source_type, source_id, actor_id, payload,
        idempotency_key, status
      ) values (
        v_account_id,
        nullif(btrim(v_event_input->>'event_type'), ''),
        nullif(btrim(v_event_input->>'source_type'), ''),
        nullif(btrim(v_event_input->>'source_id'), ''),
        nullif(v_event_input->>'actor_id', '')::uuid,
        case when jsonb_typeof(v_event_input->'payload') = 'object'
          then v_event_input->'payload' else '{}'::jsonb end,
        nullif(btrim(v_event_input->>'idempotency_key'), ''),
        'pending'
      )
      on conflict (account_id, idempotency_key) do update set
        event_type = excluded.event_type,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        actor_id = excluded.actor_id,
        payload = excluded.payload
      returning * into v_event;
      v_event_id := v_event.id;
    end if;

    select * into v_event
    from public.notification_events
    where id = v_event_id
      and (v_account_id is null or account_id = v_account_id)
    for update;
    if not found then
      raise exception 'Notification event not found.' using errcode = 'P0002';
    end if;
    if v_event.status = 'processed' then
      return jsonb_build_object(
        'event', to_jsonb(v_event), 'skipped', true,
        'message_ids', '[]'::jsonb, 'delivery_ids', '[]'::jsonb,
        'message_count', 0, 'delivery_count', 0
      );
    end if;

    update public.notification_events
    set status = 'processing', error_message = null
    where id = v_event.id;

    for v_recipient_text in
      select value
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_event.payload->'recipientIds') = 'array' then v_event.payload->'recipientIds'
          when jsonb_typeof(v_event.payload->'recipient_ids') = 'array' then v_event.payload->'recipient_ids'
          when jsonb_typeof(v_event.payload->'userIds') = 'array' then v_event.payload->'userIds'
          when jsonb_typeof(v_event.payload->'user_ids') = 'array' then v_event.payload->'user_ids'
          else '[]'::jsonb
        end
      )
    loop
      if v_recipient_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         and not (v_recipient_text::uuid = any(v_recipient_ids)) then
        v_recipient_ids := array_append(v_recipient_ids, v_recipient_text::uuid);
      end if;
    end loop;
    v_category := public.notification_worker_category(v_event.event_type);

    for v_contact in
      select profiles.id, auth_users.email::text as email, profiles.phone::text as phone
      from public.users profiles
      join basejump.account_user memberships
        on memberships.user_id = profiles.id
       and memberships.account_id = v_event.account_id
      join basejump.accounts accounts
        on accounts.id = memberships.account_id
       and accounts.status = 'active'
      left join auth.users auth_users on auth_users.id = profiles.id
      where profiles.id = any(v_recipient_ids)
    loop
      select * into v_preference
      from public.notification_preferences
      where account_id = v_event.account_id
        and user_id = v_contact.id
        and category = v_category;
      v_preference_found := found;

      if not v_preference_found or v_preference.inbox_enabled then
        v_template := public.notification_worker_template(v_event.event_type, 'inbox');
        insert into public.notification_messages (
          account_id, event_id, recipient_id, category, channel, title, content,
          link_url, priority, source_type, source_id, metadata
        ) values (
          v_event.account_id,
          v_event.id,
          v_contact.id,
          v_category,
          'inbox',
          public.notification_worker_render(v_template->>'title_template', v_event.payload),
          public.notification_worker_render(v_template->>'content_template', v_event.payload),
          coalesce(nullif(v_event.payload->>'linkUrl', ''), nullif(v_event.payload->>'link_url', '')),
          case when v_event.payload->>'priority' in ('low','normal','high','urgent')
            then v_event.payload->>'priority' else 'normal' end,
          v_event.source_type,
          v_event.source_id,
          jsonb_build_object('templateCode', v_template->>'code', 'eventType', v_event.event_type)
            || case when jsonb_typeof(v_event.payload->'metadata') = 'object'
              then v_event.payload->'metadata' else '{}'::jsonb end
        )
        on conflict (account_id, recipient_id, source_type, source_id, category) do update set
          event_id = excluded.event_id,
          title = excluded.title,
          content = excluded.content,
          link_url = excluded.link_url,
          priority = excluded.priority,
          metadata = notification_messages.metadata || excluded.metadata
        returning * into v_message;
        v_message_ids := v_message_ids || jsonb_build_array(v_message.id);
        v_message_count := v_message_count + 1;
      else
        v_message.id := null;
      end if;

      foreach v_channel in array array['email','sms']
      loop
        if not v_preference_found
           or (v_channel = 'email' and not v_preference.email_enabled)
           or (v_channel = 'sms' and not v_preference.sms_enabled) then
          continue;
        end if;
        v_target := case when v_channel = 'email' then v_contact.email else v_contact.phone end;
        if nullif(btrim(coalesce(v_target, '')), '') is null then continue; end if;
        v_template := public.notification_worker_template(v_event.event_type, v_channel);
        insert into public.notification_deliveries (
          account_id, event_id, message_id, recipient_id, channel, target,
          template_code, status
        ) values (
          v_event.account_id, v_event.id, v_message.id, v_contact.id, v_channel,
          v_target, v_template->>'code', 'pending'
        )
        on conflict (account_id, channel, event_id, recipient_id) do update set
          message_id = coalesce(excluded.message_id, notification_deliveries.message_id),
          target = excluded.target,
          template_code = excluded.template_code,
          status = case when notification_deliveries.status = 'sent'
            then notification_deliveries.status else excluded.status end,
          next_retry_at = null,
          updated_at = v_now
        returning * into v_delivery;
        v_delivery_ids := v_delivery_ids || jsonb_build_array(v_delivery.id);
        v_delivery_count := v_delivery_count + 1;
      end loop;
    end loop;

    update public.notification_events
    set status = 'processed', processed_at = v_now
    where id = v_event.id
    returning * into v_event;
    return jsonb_build_object(
      'event', to_jsonb(v_event), 'skipped', false,
      'message_ids', v_message_ids, 'delivery_ids', v_delivery_ids,
      'message_count', v_message_count, 'delivery_count', v_delivery_count
    );
  end if;

  if v_action = 'retry_candidates' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit','')::integer, 20), 1), 100);
    select coalesce(jsonb_agg(ids.id order by ids.created_at), '[]'::jsonb)
    into v_delivery_ids
    from (
      select id, created_at from public.notification_deliveries
      where (
          status = 'pending'
          or (status = 'failed' and next_retry_at is not null and next_retry_at <= v_now)
        )
        and (v_account_id is null or account_id = v_account_id)
      order by created_at limit v_limit
    ) ids;
    return v_delivery_ids;
  end if;

  if v_action = 'claim_delivery' then
    v_delivery_id := nullif(v_payload->>'delivery_id', '')::uuid;
    select deliveries.*, events.event_type, events.payload,
           messages.title as message_title, messages.content as message_content
    into v_joined
    from public.notification_deliveries deliveries
    left join public.notification_events events on events.id = deliveries.event_id
    left join public.notification_messages messages on messages.id = deliveries.message_id
    where deliveries.id = v_delivery_id
      and deliveries.status in ('pending','failed')
    for update of deliveries skip locked;
    if not found then return null; end if;

    v_attempt := coalesce(v_joined.attempt_count, 0) + 1;
    update public.notification_deliveries
    set status = 'sending', attempt_count = v_attempt, error_message = null, updated_at = v_now
    where id = v_delivery_id;
    return to_jsonb(v_joined)
      || jsonb_build_object(
        'attempt_count', v_attempt,
        'template', public.notification_worker_template(v_joined.event_type, v_joined.channel)
      );
  end if;

  if v_action = 'complete_delivery' then
    update public.notification_deliveries
    set status = 'sent',
        provider_message_id = nullif(v_payload->>'provider_message_id',''),
        error_message = null, next_retry_at = null, sent_at = v_now, updated_at = v_now
    where id = nullif(v_payload->>'delivery_id','')::uuid;
    return null;
  end if;

  if v_action = 'fail_delivery' then
    v_attempt := greatest(coalesce(nullif(v_payload->>'attempt_count','')::integer, 1), 1);
    update public.notification_deliveries
    set status = 'failed',
        error_message = left(coalesce(v_payload->>'message',''), 1000),
        next_retry_at = case when v_payload->>'should_retry' = 'true'
          then v_now + (least(1440, greatest(1, coalesce(nullif(v_payload->>'retry_minutes','')::integer, 1))) * interval '1 minute')
          else null end,
        updated_at = v_now
    where id = nullif(v_payload->>'delivery_id','')::uuid;
    return null;
  end if;

  if v_action = 'mark_event_failed' then
    update public.notification_events
    set status = 'failed', error_message = left(coalesce(v_payload->>'message',''), 1000)
    where id = nullif(v_payload->>'event_id','')::uuid;
    return null;
  end if;

  if v_action = 'prepare_unread_reminder' then
    v_message_id := nullif(v_payload->>'message_id','')::uuid;
    v_account_id := nullif(v_payload->>'account_id','')::uuid;
    select * into v_message from public.notification_messages
    where id = v_message_id and (v_account_id is null or account_id = v_account_id);
    if not found or v_message.read_at is not null or v_message.archived_at is not null then
      return jsonb_build_object('skipped', true, 'message_id', v_message_id);
    end if;
    insert into public.notification_events (
      account_id, event_type, source_type, source_id, payload, idempotency_key, status
    ) values (
      v_message.account_id, 'notification.unread.reminder', 'notification_message',
      v_message.id::text,
      jsonb_build_object(
        'title', v_message.title, 'content', 'You still have an unread notification.',
        'linkUrl', v_message.link_url, 'recipientIds', jsonb_build_array(v_message.recipient_id),
        'priority', 'normal'
      ),
      'notification-message:' || v_message.id::text || ':unread-reminder', 'pending'
    )
    on conflict (account_id, idempotency_key) do update set payload = excluded.payload
    returning * into v_event;
    return jsonb_build_object('skipped', false, 'event_id', v_event.id, 'account_id', v_event.account_id);
  end if;

  if v_action = 'prepare_digest' then
    v_account_id := nullif(v_payload->>'account_id','')::uuid;
    if v_account_id is null then raise exception 'account_id is required.' using errcode='22023'; end if;
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit','')::integer, 50), 1), 200);
    for v_joined in
      select recipient_id, count(*)::integer as total
      from public.notification_messages
      where account_id = v_account_id and read_at is null and archived_at is null
        and (nullif(v_payload->>'recipient_id','') is null or recipient_id = (v_payload->>'recipient_id')::uuid)
        and (nullif(v_payload->>'category','') is null or category = v_payload->>'category')
      group by recipient_id order by count(*) desc limit v_limit
    loop
      insert into public.notification_events (
        account_id, event_type, source_type, source_id, payload, idempotency_key, status
      ) values (
        v_account_id, 'notification.digest.created', 'notification_digest',
        v_joined.recipient_id::text || ':' || current_date::text,
        jsonb_build_object(
          'title','Unread notification digest',
          'content','You have ' || v_joined.total::text || ' unread notifications.',
          'recipientIds',jsonb_build_array(v_joined.recipient_id), 'priority','low',
          'metadata',jsonb_build_object('unreadTotal',v_joined.total)
        ),
        'notification-digest:' || v_joined.recipient_id::text || ':' || current_date::text,
        'pending'
      )
      on conflict (account_id, idempotency_key) do update set payload = excluded.payload
      returning * into v_event;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'event_id',v_event.id,'account_id',v_event.account_id
      ));
    end loop;
    return v_events;
  end if;

  if v_action = 'cleanup' then
    v_account_id := nullif(v_payload->>'account_id','')::uuid;
    if v_account_id is null then raise exception 'account_id is required.' using errcode='22023'; end if;
    v_archive_days := greatest(coalesce(nullif(v_payload->>'archive_days','')::integer,90),1);
    v_delete_days := greatest(coalesce(nullif(v_payload->>'delete_days','')::integer,180),1);
    update public.notification_messages
    set archived_at = coalesce(archived_at,v_now)
    where account_id=v_account_id and read_at is not null and archived_at is null
      and read_at < v_now - (v_archive_days * interval '1 day');
    get diagnostics v_archived = row_count;
    delete from public.notification_deliveries
    where account_id=v_account_id and status in ('sent','canceled')
      and created_at < v_now - (v_delete_days * interval '1 day');
    get diagnostics v_deleted = row_count;
    return jsonb_build_object('archived_messages',v_archived,'deleted_deliveries',v_deleted);
  end if;

  raise exception 'Unsupported notification worker action: %.', coalesce(p_action,'') using errcode='22023';
end;
$function$;

revoke all on function public.notification_worker_category(text) from public, anon, authenticated, service_role;
revoke all on function public.notification_worker_json_path(jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.notification_worker_render(text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.notification_worker_template(text,text) from public, anon, authenticated, service_role;
revoke all on function public.notification_worker_command(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.notification_worker_command(text,jsonb) to service_role;
