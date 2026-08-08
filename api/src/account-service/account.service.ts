import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BaseService, type ListItemsHandler } from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { clearUserAuthorizationCache, getCurrentUser } from '../common/utils/supabase';

type PostData = Record<string, unknown>;
type AccountRole = 'owner' | 'member';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function readAccountRole(value: unknown) {
  if (value === 'owner' || value === 'member') {
    return value as AccountRole;
  }

  throw new BadRequestException('account_role must be either "owner" or "member".');
}

function readJsonObject(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (isRecord(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      throw new BadRequestException('metadata must be valid JSON.');
    }
  }

  throw new BadRequestException('metadata must be an object.');
}

function assertRpcSucceeded<T>(
  result: { data: T | null; error: { message: string } | null },
  fallback: T
) {
  if (result.error) {
    throw new BadRequestException(result.error.message);
  }

  return result.data ?? fallback;
}

@Injectable()
export class AccountService extends BaseService {
  protected override async executeAction(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'createAccount':
        return this.createAccount(postData, context);
      case 'updateAccount':
        return this.updateAccount(postData, context);
      case 'addMember':
        return this.addMember(postData, context);
      case 'updateMemberRole':
        return this.updateMemberRole(postData, context);
      case 'removeMember':
        return this.removeMember(postData, context);
      default:
        throw new BadRequestException(`Unsupported account method: ${method}`);
    }
  }

  protected override async listItems(postData: PostData, context: ServiceContext) {
    const itemType = this.readListItemsType(postData);
    if (itemType === 'accounts') return super.listItems(postData, context);

    const requestedAccountId = this.readFilterString(postData, 'account_id') ||
      this.readFilterString(postData, 'accountId') ||
      this.readFilterString(postData, 'id');
    if (requestedAccountId) this.assertSelectedAccount(requestedAccountId, context);
    return super.listItems(postData, context);
  }

  protected override defaultListItemsType() {
    return 'accounts';
  }

  protected override listItemHandlers(): Record<string, ListItemsHandler> {
    return {
      accounts: (postData, context) => this.listAccounts(postData, context),
      account: (postData, context) => this.listAccount(postData, context),
      members: (postData, context) => this.listMembers(postData, context)
    };
  }

  private async listAccounts(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const result = await client.rpc('get_accounts');
    const rows: Record<string, unknown>[] = assertRpcSucceeded(
      result,
      [] as Record<string, unknown>[]
    );
    const accountId = this.readFilterString(postData, 'account_id') ||
      this.readFilterString(postData, 'accountId') ||
      this.readFilterString(postData, 'id');
    const slug = this.readFilterString(postData, 'slug');

    return rows.filter((account) => {
      if (accountId && String(account.account_id ?? account.id ?? '') !== accountId) return false;
      if (slug && String(account.slug ?? '') !== slug) return false;
      return true;
    });
  }

  private async listAccount(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    this.assertSelectedAccount(accountId, context);
    const result = await client.rpc('get_account', { account_id: accountId });
    const account = assertRpcSucceeded(result, null as Record<string, unknown> | null);
    return account ? [account] : [];
  }

  private async createAccount(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const slug = readString(postData.slug, 'slug');
    const name = readOptionalString(postData.name) || slug;
    const result = await client.rpc('create_account', { slug, name });
    const account = assertRpcSucceeded(result, null);
    clearUserAuthorizationCache(user.id);
    return account;
  }

  private async updateAccount(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    this.assertSelectedAccount(accountId, context);
    const slug = readOptionalString(postData.slug) || null;
    const name = readOptionalString(postData.name) || null;
    const metadata = readJsonObject(postData.metadata ?? postData.public_metadata ?? postData.publicMetadata);
    const replaceMetadata = readBoolean(postData.replace_metadata ?? postData.replaceMetadata, false);

    const result = await client.rpc('update_account', {
      account_id: accountId,
      slug,
      name,
      public_metadata: metadata,
      replace_metadata: replaceMetadata
    });
    const account = assertRpcSucceeded(result, null);
    clearUserAuthorizationCache(user.id);
    return account;
  }

  private async listMembers(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    this.assertSelectedAccount(accountId, context);
    const result = await client.rpc('get_account_members', { account_id: accountId });
    return assertRpcSucceeded(result, []);
  }

  private async addMember(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    this.assertSelectedAccount(accountId, context);
    const userId = readString(postData.user_id ?? postData.userId, 'user_id');
    const accountRole = readAccountRole(postData.account_role ?? postData.accountRole ?? 'member');

    const result = await client.rpc('add_account_member', {
      account_id: accountId,
      user_id: userId,
      account_role: accountRole
    });
    assertRpcSucceeded(result, null);
    clearUserAuthorizationCache(userId);

    return { success: true };
  }

  private async updateMemberRole(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    this.assertSelectedAccount(accountId, context);
    const userId = readString(postData.user_id ?? postData.userId, 'user_id');
    const accountRole = readAccountRole(postData.account_role ?? postData.accountRole);
    const makePrimaryOwner = readBoolean(postData.make_primary_owner ?? postData.makePrimaryOwner, false);

    const result = await client.rpc('update_account_user_role', {
      account_id: accountId,
      user_id: userId,
      new_account_role: accountRole,
      make_primary_owner: makePrimaryOwner
    });
    assertRpcSucceeded(result, null);
    clearUserAuthorizationCache(userId);

    return { success: true };
  }

  private async removeMember(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    this.assertSelectedAccount(accountId, context);
    const userId = readString(postData.user_id ?? postData.userId, 'user_id');
    const result = await client.rpc('remove_account_member', {
      account_id: accountId,
      user_id: userId
    });
    assertRpcSucceeded(result, null);
    clearUserAuthorizationCache(userId);

    return { success: true };
  }

  private assertSelectedAccount(accountId: string, context: ServiceContext) {
    if (!context.accountId || accountId !== context.accountId) {
      throw new ForbiddenException('The requested account must match the active account set.');
    }
  }
}
