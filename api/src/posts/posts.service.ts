import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ServiceContext,
  ServiceExecutor
} from '../common/interfaces/service-executor';
import { getCurrentUser } from '../common/utils/supabase';

type PostData = Record<string, unknown>;

function readString(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

function readNumber(value: unknown, name: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

function readNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function isMissingPostsTable(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || Boolean(error.message?.includes('public.posts'));
}

@Injectable()
export class PostsService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'list':
        return this.list(context);
      case 'create':
        return this.create(postData, context);
      case 'update':
        return this.update(postData, context);
      case 'delete':
        return this.delete(postData, context);
      default:
        throw new BadRequestException(`Unsupported posts method: ${method}`);
    }
  }

  private async list(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const { data, error } = await client
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingPostsTable(error)) return [];
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  private async create(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const title = readString(postData.title, 'title');
    const content = readNullableString(postData.content);
    const now = new Date().toISOString();

    const { data, error } = await client
      .from('posts')
      .insert({
        user_id: user.id,
        title,
        content,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private async update(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const id = readNumber(postData.id, 'id');
    const title = readString(postData.title, 'title');
    const content = readNullableString(postData.content);

    const { data, error } = await client
      .from('posts')
      .update({
        title,
        content,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private async delete(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const id = readNumber(postData.id, 'id');

    const { error } = await client
      .from('posts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }
}
