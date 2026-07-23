import { BadRequestException, Injectable } from '@nestjs/common';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { createSupabaseClient, getCurrentUser } from '../common/utils/supabase';

type PostData = Record<string, unknown>;

function readString(value: unknown, name: string, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (fallback) {
    return fallback;
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

@Injectable()
export class UserService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'me':
      case 'profile':
        return this.me(context);
      case 'updateProfile':
        return this.updateProfile(postData, context);
      case 'updateEmail':
        return this.updateEmail(postData, context);
      default:
        throw new BadRequestException(`Unsupported user method: ${method}`);
    }
  }

  private async me(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const { data: profile, error } = await client
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      user,
      profile: profile ?? null
    };
  }

  private async updateProfile(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const fullName = readString(postData.fullName, 'fullName');
    const avatarUrl =
      typeof postData.avatarUrl === 'string' ? postData.avatarUrl.trim() : '';

    const { error: authError } = await client.auth.updateUser({
      data: {
        full_name: fullName,
        avatar_url: avatarUrl || undefined
      }
    });

    if (authError) {
      throw new BadRequestException(authError.message);
    }

    const { error: dbError } = await client
      .from('users')
      .update({
        full_name: fullName,
        avatar_url: avatarUrl || null
      })
      .eq('id', user.id);

    if (dbError) {
      throw new BadRequestException(dbError.message);
    }

    return {
      success: true,
      fullName,
      avatarUrl: avatarUrl || null
    };
  }

  private async updateEmail(postData: PostData, context: ServiceContext) {
    const { client } = await getCurrentUser(context);
    const email = readString(postData.email, 'email');

    const { error } = await client.auth.updateUser({ email });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      email
    };
  }
}
