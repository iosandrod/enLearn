import assert from 'node:assert/strict';

import type { CrudContext } from '../src/common/base.service';
import type { ServiceContext } from '../src/common/interfaces/service-executor';
import { ChatService } from '../src/chat-service/chat.service';
import { PaymentService } from '../src/payment-service/payment.service';
import { UserService } from '../src/user-service/user.service';

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

function createClient(rpcCalls: RpcCall[]) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'execute_dynamic_crud') {
        const operation = args.p_operation as Record<string, unknown>;
        const action = String(args.p_action);
        if (action === 'create') {
          const items = operation.items as Array<Record<string, unknown>>;
          return { data: items.map((item) => item.data), error: null };
        }
        return { data: operation.data ?? {}, error: null };
      }
      return { data: null, error: null };
    }
  };
}

class TestChatService extends ChatService {
  constructor(private readonly fakeClient: ReturnType<typeof createClient>) {
    super();
  }

  protected override async createCrudClient() {
    return this.fakeClient as never;
  }

  protected override async callDynamicCrudRpc(
    ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>
  ) {
    const result = await this.fakeClient.rpc('execute_dynamic_crud', {
      p_action: action,
      p_table_name: ctx.resource.tableName,
      p_config: this.buildDynamicCrudConfig(ctx),
      p_operation: operation,
      p_account_id: ctx.context.accountId ?? null
    });
    return result.data;
  }

  protected override async tryReadCurrentUser() {
    return { id: '00000000-0000-4000-8000-000000000111' } as never;
  }

  async createConversationForTest(context: ServiceContext) {
    return this.runCrud('create', {
      resource: 'chat_conversations',
      data: {
        account_id: context.accountId,
        type: 'group',
        title: 'RPC boundary',
        created_by: '00000000-0000-4000-8000-000000000111',
        metadata: {},
        __details: [{
          resource: 'chat_conversation_members',
          foreignKey: 'conversation_id',
          inheritFields: ['account_id'],
          rows: [
            { user_id: '00000000-0000-4000-8000-000000000111', role: 'owner' },
            { user_id: '00000000-0000-4000-8000-000000000333', role: 'member' }
          ]
        }]
      }
    }, context);
  }
}

class TestPaymentService extends PaymentService {
  constructor(private readonly fakeClient: ReturnType<typeof createClient>) {
    super();
  }

  protected override async createCrudClient() {
    return this.fakeClient as never;
  }

  protected override async callDynamicCrudRpc(
    ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>
  ) {
    const result = await this.fakeClient.rpc('execute_dynamic_crud', {
      p_action: action,
      p_table_name: ctx.resource.tableName,
      p_config: this.buildDynamicCrudConfig(ctx),
      p_operation: operation,
      p_account_id: ctx.context.accountId ?? null
    });
    return result.data;
  }

  protected override async tryReadCurrentUser() {
    return { id: '00000000-0000-4000-8000-000000000111' } as never;
  }

  async saveCustomerForTest(context: ServiceContext, action: 'create' | 'update') {
    return this.runCrud(action, {
      resource: 'customers',
      id: action === 'update' ? '00000000-0000-4000-8000-000000000111' : undefined,
      data: {
        id: '00000000-0000-4000-8000-000000000111',
        stripe_customer_id: 'cus_rpc_boundary'
      }
    }, context);
  }
}

class TestUserService extends UserService {
  constructor(private readonly fakeClient: ReturnType<typeof createClient>) {
    super();
  }

  protected override async createCrudClient() {
    return this.fakeClient as never;
  }

  protected override async callDynamicCrudRpc(
    ctx: CrudContext,
    action: 'create' | 'update' | 'delete',
    operation: Record<string, unknown>
  ) {
    const result = await this.fakeClient.rpc('execute_dynamic_crud', {
      p_action: action,
      p_table_name: ctx.resource.tableName,
      p_config: this.buildDynamicCrudConfig(ctx),
      p_operation: operation,
      p_account_id: ctx.context.accountId ?? null
    });
    return result.data;
  }

  protected override async tryReadCurrentUser() {
    return { id: '00000000-0000-4000-8000-000000000111' } as never;
  }

  async saveProfileForTest(context: ServiceContext) {
    return this.runCrud('update', {
      resource: 'users',
      id: '00000000-0000-4000-8000-000000000111',
      data: { full_name: 'RPC Boundary', avatar_url: null }
    }, context);
  }
}

async function main() {
  const rpcCalls: RpcCall[] = [];
  const fakeClient = createClient(rpcCalls);
  const context: ServiceContext = {
    authorization: 'Bearer test-token',
    accountId: '00000000-0000-4000-8000-000000000001'
  };

  await assert.rejects(
    () => new TestUserService(fakeClient).execute('updateItem', {
      resource: 'users',
      id: '00000000-0000-4000-8000-000000000111',
      data: { full_name: 'bypass' }
    }, context),
    /only available through its service method/
  );
  await assert.rejects(
    () => new TestPaymentService(fakeClient).execute('createItem', {
      resource: 'customers',
      data: {
        id: '00000000-0000-4000-8000-000000000111',
        stripe_customer_id: 'cus_bypass'
      }
    }, context),
    /only available through its service method/
  );
  await assert.rejects(
    () => new TestChatService(fakeClient).execute('createItem', {
      resource: 'chat_conversation_members',
      data: {
        account_id: context.accountId,
        conversation_id: '00000000-0000-4000-8000-000000000222',
        user_id: '00000000-0000-4000-8000-000000000333'
      }
    }, context),
    /only available through its service method/
  );

  await new TestUserService(fakeClient).saveProfileForTest(context);
  await new TestPaymentService(fakeClient).saveCustomerForTest(context, 'create');
  await new TestPaymentService(fakeClient).saveCustomerForTest(context, 'update');
  await new TestChatService(fakeClient).createConversationForTest(context);

  assert.deepEqual(
    rpcCalls.map((call) => [call.name, call.args.p_action, call.args.p_table_name]),
    [
      ['execute_dynamic_crud', 'update', 'users'],
      ['execute_dynamic_crud', 'create', 'customers'],
      ['execute_dynamic_crud', 'update', 'customers'],
      ['execute_dynamic_crud', 'create', 'chat_conversations']
    ]
  );
  const chatOperation = rpcCalls[3].args.p_operation as Record<string, unknown>;
  assert.equal((chatOperation.items as unknown[]).length, 1);
  const chatItem = (chatOperation.items as Array<Record<string, unknown>>)[0];
  assert.equal((chatItem.details as unknown[]).length, 1);
  assert.equal(
    ((chatItem.details as Array<Record<string, unknown>>)[0].rows as unknown[]).length,
    2
  );
  console.log('User/payment/chat Base CRUD RPC boundary smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
