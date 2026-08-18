import assert from 'node:assert/strict';
import type { AiServiceRouter } from '../ai-service-router';
import type { AiToolContext } from '../ai.types';
import { aiToolRegistryInternals } from './ai-tool.registry';

const context = {
  principal: {
    context: {
      accountId: 'account-1',
      userId: 'user-1',
      accountRole: 'member'
    },
    permissionCodes: ['ai.assistant.use'],
    isLegacyAdmin: false
  },
  runId: 'run-1',
  conversationId: 'conversation-1',
  mode: 'create_page',
  pageContext: {}
} as AiToolContext;

const router: AiServiceRouter = {
  async invoke() {
    return [{ value: 'public.sales_orders', tableName: 'public.sales_orders' }];
  }
};

async function main() {
  assert.deepEqual(
    aiToolRegistryInternals.summarizeTableOptions([{
      value: 'public.sales_orders',
      tableName: 'public.sales_orders',
      label: 'Sales orders',
      title: 'Sales Orders',
      schema: 'public',
      name: 'sales_orders',
      comment: 'x'.repeat(20_000)
    }]),
    [{
      value: 'public.sales_orders',
      title: 'Sales Orders'
    }]
  );
  assert.equal(
    await aiToolRegistryInternals.assertAllowedTable(router, context, 'public.sales_orders'),
    'public.sales_orders'
  );
  await assert.rejects(
    () => aiToolRegistryInternals.assertAllowedTable(router, context, 'private.secrets'),
    /not available/
  );

  console.log('AI tool registry tests passed');
}

void main();
