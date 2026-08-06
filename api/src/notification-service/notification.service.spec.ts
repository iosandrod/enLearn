import assert from 'node:assert/strict';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { NotificationService } from './notification.service';

class NotificationServiceHarness extends NotificationService {
  adminChecks = 0;
  membershipChecked = false;

  constructor(
    private readonly userId: string,
    private readonly userClient: SupabaseClient,
    private readonly adminClient: SupabaseClient,
    private readonly expectedContext: ServiceContext
  ) {
    super();
  }

  protected override async getNotificationCurrentUser(context: ServiceContext) {
    assert.strictEqual(context, this.expectedContext);
    return { client: this.userClient, user: { id: this.userId } as User };
  }

  protected override async requireNotificationAdmin(context: ServiceContext) {
    assert.strictEqual(context, this.expectedContext);
    this.adminChecks += 1;
    return {} as Awaited<ReturnType<NotificationService['requireNotificationAdmin']>>;
  }

  protected override async assertNotificationAccountUsers(
    context: ServiceContext,
    userIds: string[]
  ) {
    assert.strictEqual(context, this.expectedContext);
    assert.deepEqual(userIds, [this.userId]);
    this.membershipChecked = true;
  }

  protected override createNotificationCommandClient(context: ServiceContext) {
    assert.strictEqual(context, this.expectedContext);
    assert.equal(this.membershipChecked, true);
    return this.adminClient;
  }
}

async function main() {
  const userId = '90f8c866-56d2-4a0d-aa8c-e50534a97ebd';
  const accountId = '00000000-0000-4000-8000-000000000001';
  const context: ServiceContext = {
    authorization: 'Bearer test-token',
    accountId,
    userId
  };
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  const userClient = {
    rpc: async () => {
      throw new Error('The authenticated client must not execute the service-role RPC.');
    }
  } as unknown as SupabaseClient;
  const adminClient = {
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: [], error: null };
    }
  } as unknown as SupabaseClient;

  const service = new NotificationServiceHarness(userId, userClient, adminClient, context);
  const result = await service.execute(
    'markAllRead',
    { userId, tenantId: accountId },
    context
  );

  assert.equal(service.adminChecks, 0);
  assert.deepEqual(result, { success: true, count: 0, messages: [] });
  assert.deepEqual(rpcCalls, [{
    name: 'notification_api_command',
    args: {
      p_action: 'mark_read',
      p_payload: {
        account_id: accountId,
        recipient_id: userId,
        ids: [],
        category: null
      }
    }
  }]);

  console.log('notification service-role RPC boundary tests passed');
}

void main();
