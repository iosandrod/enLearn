import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ServiceContext } from '../interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getFreshUserAccounts,
  type AccountSummary
} from './supabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ActiveAccountContext = ServiceContext & {
  userId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  accountRole: 'owner' | 'member';
};

export function readAccountId(value: unknown, fieldName = 'X-Account-Id') {
  const accountId = typeof value === 'string' ? value.trim() : '';
  if (!accountId) {
    throw new BadRequestException(`${fieldName} is required.`);
  }
  if (!UUID_PATTERN.test(accountId)) {
    throw new BadRequestException(`${fieldName} must be a valid UUID.`);
  }
  return accountId;
}

export function isAccountActive(account: AccountSummary) {
  return account.status !== 'inactive' && account.status !== 'archived';
}

export async function requireActiveAccount(
  context: ServiceContext,
  requestedAccountId?: unknown
): Promise<{ context: ActiveAccountContext; account: AccountSummary }> {
  const accountId = readAccountId(requestedAccountId ?? context.accountId);
  const { client, user } = await getCurrentUser(context);
  const accounts = await getFreshUserAccounts(client);
  const account = accounts.find((item) => item.account_id === accountId);

  if (!account) {
    throw new ForbiddenException('You are not a member of the selected account set.');
  }
  if (!isAccountActive(account)) {
    throw new ForbiddenException('The selected account set is not active.');
  }

  return {
    account,
    context: {
      ...context,
      userId: user.id,
      accountId,
      accountCode: account.code ?? undefined,
      accountName: account.name ?? undefined,
      accountRole: account.account_role
    }
  };
}

export function getActiveAccountId(context: ServiceContext) {
  return readAccountId(context.accountId, 'Account context');
}

export async function listActiveAccountUserIds(context: ServiceContext) {
  const accountId = getActiveAccountId(context);
  await getCurrentUser(context);
  const client = createSupabaseClient('admin', context);
  const { data, error } = await client.rpc('account_user_ids', {
    account_id: accountId
  });

  if (error) {
    throw new BadRequestException(error.message);
  }

  return [
    ...new Set(
      (Array.isArray(data) ? data : [])
        .map((membership: unknown) =>
          typeof membership === 'string'
            ? membership.trim()
            : typeof membership === 'object' && membership !== null
              ? String((membership as Record<string, unknown>).user_id ?? '').trim()
              : ''
        )
        .filter(Boolean)
    )
  ];
}

export async function assertAccountUsers(
  context: ServiceContext,
  userIds: string[],
  message = 'Every selected user must belong to the active account set.'
) {
  const requestedIds = [
    ...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))
  ];
  if (!requestedIds.length) return;

  const memberIds = new Set(await listActiveAccountUserIds(context));
  if (requestedIds.some((userId) => !memberIds.has(userId))) {
    throw new ForbiddenException(message);
  }
}
