import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import type { AuthError, Provider, Session, User } from '@supabase/supabase-js';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  clearUserAuthorizationCache,
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  requireAdmin
} from '../common/utils/supabase';
import type {
  DevImpersonateAuthDto,
  EmailPasswordAuthDto,
  OAuthUrlDto,
  RefreshSessionDto,
  SelectAccountDto,
  SetSessionDto,
  SignInPasswordAuthDto
} from './auth.dto';
import { requireActiveAccount } from '../common/utils/account-context';

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

const ADMIN_LOGIN_ALIAS = 'admin';
const ADMIN_LOGIN_EMAIL = '1151685410@qq.com';

function normalizeLoginEmail(email: string) {
  const trimmedEmail = email.trim();
  return trimmedEmail.toLowerCase() === ADMIN_LOGIN_ALIAS ? ADMIN_LOGIN_EMAIL : trimmedEmail;
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
  async listLoginAccountOptions(login?: string) {
    const normalizedLogin = normalizeLoginEmail(login ?? '');
    if (!normalizedLogin) return { accounts: [] };

    const admin = createSupabaseClient('admin');
    let page = 1;
    let userId = '';
    while (!userId) {
      const { data: users, error: userError } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000
      });
      if (userError) {
        throw new BadRequestException(userError.message);
      }

      const rows = users.users;
      userId = rows.find(
        (user) => user.email?.trim().toLowerCase() === normalizedLogin.toLowerCase()
      )?.id ?? '';
      if (userId || rows.length < 1000) break;
      page += 1;
    }

    if (!userId) return { accounts: [] };

    const { data, error } = await admin.rpc('get_login_account_options', {
      login_user_id: userId
    });
    if (error) {
      throw new BadRequestException(error.message);
    }

    return { accounts: Array.isArray(data) ? data : [] };
  }

  async signInWithPassword(dto: SignInPasswordAuthDto) {
    const supabase = createSupabaseClient('public');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeLoginEmail(dto.email),
      password: dto.password
    });

    if (error || !data.user) {
      throwAuthError(error, 'Invalid email or password.');
    }

    if (dto.accountId && data.session?.access_token) {
      const selectedAccount = await this.selectAccount(
        {
          accountId: dto.accountId,
          setDefault: dto.setDefault
        },
        { authorization: `Bearer ${data.session.access_token}` }
      );

      return {
        ...selectedAccount,
        session: toPublicSession(data.session)
      };
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

    const authorization = await getUserAuthorization(supabase, user.id, { refresh: true });
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: authorization.accounts,
      activeAccount: null,
      accountRequired: true,
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

  async impersonateDevUser(dto: DevImpersonateAuthDto, context: ServiceContext) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Route not found.');
    }

    const selected = await requireActiveAccount(context, dto.accountId);
    await requireAdmin(selected.context, [
      'workflow.definitions.manage',
      'workflow.runtime.manage',
      'admin.users.manage'
    ]);

    const admin = createSupabaseClient('admin', context);
    const { data: membershipRows, error: membershipError } = await admin.rpc(
      'account_user_ids',
      { account_id: dto.accountId }
    );
    if (membershipError) {
      throw new BadRequestException(membershipError.message);
    }
    const isAccountUser = (Array.isArray(membershipRows) ? membershipRows : []).some(
      (membership: unknown) =>
        typeof membership === 'string'
          ? membership === dto.userId
          : typeof membership === 'object' && membership !== null &&
            String((membership as Record<string, unknown>).user_id ?? '') === dto.userId
    );
    if (!isAccountUser) {
      throw new ForbiddenException('The selected test user does not belong to this account set.');
    }

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(dto.userId);
    const targetUser = userResult.user;
    if (userError || !targetUser?.email) {
      throw new NotFoundException('The selected test user is unavailable for simulated login.');
    }

    const { data: linkResult, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email
    });
    if (linkError || !linkResult.properties.hashed_token) {
      throw new BadRequestException(linkError?.message ?? 'Could not create the simulated login token.');
    }

    const publicClient = createSupabaseClient('public');
    const { data: sessionResult, error: sessionError } = await publicClient.auth.verifyOtp({
      token_hash: linkResult.properties.hashed_token,
      type: 'magiclink'
    });
    if (sessionError || !sessionResult.user || !sessionResult.session) {
      throwAuthError(sessionError, 'Could not start the simulated login session.');
    }
    if (sessionResult.user.id !== dto.userId) {
      throw new UnauthorizedException('Simulated login identity mismatch.');
    }

    const authorization = `Bearer ${sessionResult.session.access_token}`;
    const selectedAccount = await this.selectAccount(
      { accountId: dto.accountId },
      { authorization, requestId: context.requestId }
    );

    return {
      ...selectedAccount,
      session: toPublicSession(sessionResult.session),
      impersonated: true
    };
  }

  async me(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const globalAuthorization = await getUserAuthorization(client, user.id, { refresh: true });
    const requestedAccount = context.accountId
      ? globalAuthorization.accounts.find((account) => account.account_id === context.accountId)
      : undefined;
    const activeAccount = requestedAccount &&
      requestedAccount.status !== 'inactive' &&
      requestedAccount.status !== 'archived'
      ? requestedAccount
      : null;
    const authorization = activeAccount
      ? await getUserAuthorization(client, user.id, { accountId: activeAccount.account_id })
      : globalAuthorization;

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: globalAuthorization.accounts,
      activeAccount,
      accountRequired: !activeAccount,
      session: null
    };
  }

  async selectAccount(dto: SelectAccountDto, context: ServiceContext) {
    const selected = await requireActiveAccount(context, dto.accountId);
    const { client, user } = await getCurrentUser(selected.context);
    const { error: selectError } = await client.rpc('select_account_set_with_preference', {
      account_id: selected.account.account_id,
      set_default: dto.setDefault === true
    });
    if (selectError && !selectError.message.includes('Could not find the function')) {
      throw new BadRequestException(selectError.message);
    }
    clearUserAuthorizationCache(user.id);
    const authorization = await getUserAuthorization(client, user.id, {
      refresh: true,
      accountId: selected.account.account_id
    });
    const activeAccount = authorization.accounts.find(
      (account) => account.account_id === selected.account.account_id
    ) ?? selected.account;

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: authorization.accounts,
      activeAccount,
      accountRequired: false,
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
        activeAccount: null,
        accountRequired: true,
        session: null
      };
    }

    const client = createSupabaseClient(
      'user',
      { authorization: `Bearer ${session.access_token}` }
    );

    const authorization = await getUserAuthorization(client, user.id, { refresh: true });

    return {
      user: toPublicUser(user),
      profile: authorization.profile,
      permissions: authorization.permissionCodes,
      accounts: authorization.accounts,
      activeAccount: null,
      accountRequired: true,
      session: session ? toPublicSession(session) : null
    };
  }

}
