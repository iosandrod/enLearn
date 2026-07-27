import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthError, Provider, Session, User } from '@supabase/supabase-js';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization
} from '../common/utils/supabase';
import type {
  EmailPasswordAuthDto,
  OAuthUrlDto,
  RefreshSessionDto,
  SetSessionDto
} from './auth.dto';

type PublicUser = Pick<
  User,
  | 'id'
  | 'aud'
  | 'role'
  | 'email'
  | 'phone'
  | 'app_metadata'
  | 'user_metadata'
  | 'created_at'
  | 'updated_at'
>;

type PublicSession = Pick<
  Session,
  'access_token' | 'refresh_token' | 'expires_at' | 'expires_in' | 'token_type'
> & {
  user: PublicUser;
};

function throwAuthError(error: AuthError | null, fallback: string): never {
  throw new UnauthorizedException(error?.message ?? fallback);
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    aud: user.aud,
    role: user.role,
    email: user.email,
    phone: user.phone,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

function toPublicSession(session: Session): PublicSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: toPublicUser(session.user)
  };
}

@Injectable()
export class AuthService {
  async signInWithPassword(dto: EmailPasswordAuthDto) {
    const supabase = createSupabaseClient('public');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email.trim(),
      password: dto.password
    });

    if (error || !data.user) {
      throwAuthError(error, 'Invalid email or password.');
    }

    return this.buildAuthResponse(data.user, data.session);
  }

  async signUp(dto: EmailPasswordAuthDto) {
    const supabase = createSupabaseClient('public');
    const { data, error } = await supabase.auth.signUp({
      email: dto.email.trim(),
      password: dto.password
    });

    if (error || !data.user) {
      throwAuthError(error, 'Could not create account.');
    }

    return this.buildAuthResponse(data.user, data.session);
  }

  async getOAuthUrl(dto: OAuthUrlDto) {
    const supabase = createSupabaseClient('public');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: dto.provider as Provider,
      options: {
        redirectTo: dto.redirectTo,
        skipBrowserRedirect: true
      }
    });

    if (error || !data.url) {
      throw new BadRequestException(error?.message ?? 'Could not create OAuth URL.');
    }

    return { url: data.url };
  }

  async setSession(dto: SetSessionDto) {
    const supabase = createSupabaseClient('user', {
      authorization: `Bearer ${dto.accessToken}`
    });
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      throwAuthError(error, 'Invalid auth session.');
    }

    const authorization = await getUserAuthorization(supabase, user.id);
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: authorization.accounts,
      session: {
        access_token: dto.accessToken,
        refresh_token: dto.refreshToken ?? '',
        expires_at: dto.expiresAt,
        expires_in: dto.expiresAt ? Math.max(dto.expiresAt - nowSeconds, 0) : 0,
        token_type: 'bearer',
        user: toPublicUser(user)
      }
    };
  }

  async refreshSession(dto: RefreshSessionDto) {
    const supabase = createSupabaseClient('public');
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: dto.refreshToken
    });

    if (error || !data.user || !data.session) {
      throwAuthError(error, 'Could not refresh auth session.');
    }

    return this.buildAuthResponse(data.user, data.session);
  }

  async me(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id);

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: authorization.accounts,
      session: null
    };
  }

  async signOut(context: ServiceContext) {
    if (!context.authorization) {
      return { success: true };
    }

    const supabase = createSupabaseClient('user', context);
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async buildAuthResponse(user: User, session: Session | null) {
    if (!session?.access_token) {
      return {
        user: toPublicUser(user),
        profile: null,
        permissions: [],
        accounts: [],
        session: null
      };
    }

    const client = createSupabaseClient(
      'user',
      { authorization: `Bearer ${session.access_token}` }
    );

    const authorization = await getUserAuthorization(client, user.id);

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: authorization.accounts,
      session: session ? toPublicSession(session) : null
    };
  }

  private async getProfile(client: ReturnType<typeof createSupabaseClient>, userId: string) {
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data ?? null;
  }
}
