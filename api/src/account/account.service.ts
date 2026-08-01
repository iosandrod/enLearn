import { BadRequestException, Injectable } from '@nestjs/common';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { getCurrentUser } from '../common/utils/supabase';

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
export class AccountService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'listItems':
        return this.listItems(postData, context);
      case 'getAccount':
        return this.getAccount(postData, context);
      case 'getPersonalAccount':
        return this.getPersonalAccount(context);
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

  private async listItems(postData: PostData, context: ServiceContext) {
    switch (readOptionalString(postData.itemType ?? postData.item_type ?? postData.type) || 'accounts') {
      case 'accounts':
        return this.listAccounts(context);
      case 'members':
        return this.listMembers(postData, context);
      default:
        throw new BadRequestException('Unsupported account listItems itemType.');
    }
  }

  private async listAccounts(context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const result = await client.rpc('get_accounts');
    return assertRpcSucceeded(result, []);
  }

  private async getAccount(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    const result = await client.rpc('get_account', { account_id: accountId });
    return assertRpcSucceeded(result, null);
  }

  private async getPersonalAccount(context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const result = await client.rpc('get_personal_account');
    return assertRpcSucceeded(result, null);
  }

  private async createAccount(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const slug = readString(postData.slug, 'slug');
    const name = readOptionalString(postData.name) || slug;
    const result = await client.rpc('create_account', { slug, name });
    return assertRpcSucceeded(result, null);
  }

  private async updateAccount(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
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
    return assertRpcSucceeded(result, null);
  }

  private async listMembers(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    const result = await client.rpc('get_account_members', { account_id: accountId });
    return assertRpcSucceeded(result, []);
  }

  private async addMember(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    const userId = readString(postData.user_id ?? postData.userId, 'user_id');
    const accountRole = readAccountRole(postData.account_role ?? postData.accountRole ?? 'member');

    const result = await client.rpc('add_account_member', {
      account_id: accountId,
      user_id: userId,
      account_role: accountRole
    });
    assertRpcSucceeded(result, null);

    return { success: true };
  }

  private async updateMemberRole(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
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

    return { success: true };
  }

  private async removeMember(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const accountId = readString(postData.account_id ?? postData.accountId, 'account_id');
    const userId = readString(postData.user_id ?? postData.userId, 'user_id');
    const result = await client.rpc('remove_account_member', {
      account_id: accountId,
      user_id: userId
    });
    assertRpcSucceeded(result, null);

    return { success: true };
  }
}
