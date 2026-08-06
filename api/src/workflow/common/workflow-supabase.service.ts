import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../../common/utils/supabase';
import { getWorkflowEnv } from './env';

@Injectable()
export class WorkflowSupabaseService {
  private readonly adminClient?: SupabaseClient;

  constructor() {
    const env = getWorkflowEnv();
    const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
    const anonKey =
      env.SUPABASE_ANON_KEY ??
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url?.trim() || !anonKey?.trim() || !env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return;
    }

    this.adminClient = createSupabaseClient('admin');
  }

  get isConfigured() {
    return Boolean(this.adminClient);
  }

  get client() {
    if (!this.adminClient) {
      throw new Error(
        'Supabase URL, anon key, and SUPABASE_SERVICE_ROLE_KEY are required for workflow persistence.'
      );
    }
    return this.adminClient;
  }
}
