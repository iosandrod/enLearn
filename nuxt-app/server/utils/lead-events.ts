import type { H3Event } from 'h3';
import type { User } from '@supabase/supabase-js';
import type { Json } from '~/types/database';

export async function trackLeadEvent(
  event: H3Event,
  user: User,
  eventType: string,
  eventData: Record<string, Json | undefined> = {}
) {
  const supabase = createServerSupabase(event);
  const { error } = await supabase.from('lead_events').insert({
    user_id: user.id,
    event_type: eventType,
    event_data: eventData
  });

  if (error) {
    console.warn(`Could not track lead event ${eventType}: ${error.message}`);
  }
}
