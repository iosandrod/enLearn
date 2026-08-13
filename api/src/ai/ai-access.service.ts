import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { requireActiveAccount } from '../common/utils/account-context';
import {
  getCurrentUser,
  getUserAuthorization
} from '../common/utils/supabase';
import type { AiPrincipal } from './ai.types';

@Injectable()
export class AiAccessService {
  async authenticate(
    context: ServiceContext,
    accountId: string | undefined,
    permission: string | string[] = 'ai.assistant.use'
  ): Promise<AiPrincipal> {
    const required = Array.isArray(permission) ? permission : [permission];
    const active = await requireActiveAccount(context, accountId);
    const { client, user } = await getCurrentUser(active.context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: active.context.accountId
    });

    if (!authorization.isLegacyAdmin && (
      !required.length || !required.every((code) => authorization.permissionCodes.includes(code))
    )) {
      throw new ForbiddenException('AI assistant permission required.');
    }

    return {
      context: active.context,
      permissionCodes: authorization.permissionCodes,
      isLegacyAdmin: authorization.isLegacyAdmin
    };
  }

  assertPermission(principal: AiPrincipal, permission: string | string[]) {
    if (principal.isLegacyAdmin) return;
    const required = Array.isArray(permission) ? permission : [permission];
    if (!required.length || !required.every((code) => principal.permissionCodes.includes(code))) {
      throw new ForbiddenException('AI page proposal permission required.');
    }
  }
}
