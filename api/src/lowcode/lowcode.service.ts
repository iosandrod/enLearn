import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type {
  ServiceContext,
  ServiceExecutor
} from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission,
  requireAdmin
} from '../common/utils/supabase';
import {
  LowCodeSchemaValidationError,
  assertValidLowCodePageSchema,
  isRecord,
  migrateLowCodePageSchema,
  type LowCodePageSchema
} from './lowcode.schema';

type LowCodePageRow = {
  id: string;
  code: string;
  route: string;
  title: string;
  description: string | null;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  schema: LowCodePageSchema;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeSchema(value: unknown, shouldValidate = false): LowCodePageSchema {
  try {
    const schema = migrateLowCodePageSchema(value);
    if (shouldValidate) {
      assertValidLowCodePageSchema(schema);
    }
    return schema;
  } catch (error) {
    if (error instanceof LowCodeSchemaValidationError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}

function normalizePageRow(row: LowCodePageRow) {
  return {
    ...row,
    schema: normalizeSchema(row.schema)
  };
}

@Injectable()
export class LowCodeService implements ServiceExecutor {
  async execute(method: string, postData: Record<string, unknown>, context: ServiceContext) {
    switch (method) {
      case 'listPages':
        return this.listPages(context);
      case 'getPage':
        return this.getPage(postData, context);
      case 'savePage':
        return this.savePage(postData, context);
      case 'publishPage':
        return this.publishPage(postData, context);
      case 'archivePage':
        return this.archivePage(postData, context);
      default:
        throw new BadRequestException(`Unsupported lowcode method: ${method}`);
    }
  }

  private async listPages(context: ServiceContext) {
    const { client } = await requireAdmin(context, [
      'lowcode.pages.manage',
      'admin.permissions.manage',
      'admin.routes.manage',
      'admin.entities.manage'
    ]);
    const { data, error } = await client
      .from('lowcode_pages')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((row) => normalizePageRow(row as LowCodePageRow));
  }

  private async getPage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const code = typeof postData.code === 'string' ? postData.code.trim() : '';
    const route = typeof postData.route === 'string' ? postData.route.trim() : '';
    const includeData = postData.includeData !== false;

    if (!code && !route) {
      throw new BadRequestException('code or route is required.');
    }

    let query = client.from('lowcode_pages').select('*');

    if (code) {
      query = query.eq('code', code);
    } else {
      query = query.eq('route', route);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Low-code page not found.');
    }

    await this.assertCanReadPage(client, user.id, data as LowCodePageRow, route);

    const page = normalizePageRow(data as LowCodePageRow);
    return {
      ...page,
      resolvedData: includeData ? {} : {}
    };
  }

  private async assertCanReadPage(
    client: ReturnType<typeof createSupabaseClient>,
    userId: string,
    page: LowCodePageRow,
    requestedRoute: string
  ) {
    const authorization = await getUserAuthorization(client, userId);

    if (hasRequiredPermission(authorization, 'lowcode.pages.manage')) {
      return;
    }

    let routeClient = client;
    try {
      routeClient = createSupabaseClient('admin');
    } catch {
      routeClient = client;
    }

    const candidatePaths = [...new Set([requestedRoute, page.route].filter(Boolean))];
    const routePermissions = new Set<string>();

    if (candidatePaths.length) {
      const { data: pathRows, error: pathError } = await routeClient
        .from('admin_routes')
        .select('permission_code')
        .in('path', candidatePaths);

      if (pathError) {
        throw new ForbiddenException(pathError.message);
      }

      for (const row of pathRows ?? []) {
        const permissionCode = (row as Record<string, unknown>).permission_code;
        if (typeof permissionCode === 'string' && permissionCode.trim()) {
          routePermissions.add(permissionCode.trim());
        }
      }
    }

    const { data: pageRows, error: pageError } = await routeClient
      .from('admin_routes')
      .select('permission_code')
      .eq('page_code', page.code);

    if (pageError) {
      throw new ForbiddenException(pageError.message);
    }

    for (const row of pageRows ?? []) {
      const permissionCode = (row as Record<string, unknown>).permission_code;
      if (typeof permissionCode === 'string' && permissionCode.trim()) {
        routePermissions.add(permissionCode.trim());
      }
    }

    if (routePermissions.size && hasRequiredPermission(authorization, [...routePermissions])) {
      return;
    }

    throw new ForbiddenException('Low-code page permission required.');
  }

  private async savePage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'lowcode.pages.manage');
    const schema = normalizeSchema(postData.schema ?? postData, true);
    const existingCode = typeof postData.code === 'string' ? postData.code.trim() : schema.code;

    if (!existingCode) {
      throw new BadRequestException('code is required.');
    }

    const { data: existing, error: lookupError } = await client
      .from('lowcode_pages')
      .select('*')
      .eq('code', existingCode)
      .maybeSingle();

    if (lookupError) {
      throw new BadRequestException(lookupError.message);
    }

    const nextVersion = (existing?.version ?? 0) + 1;
    const pagePayload = {
      code: schema.code,
      route: schema.route,
      title: schema.title,
      description: schema.description ?? null,
      layout: schema.layout ?? 'dashboard',
      status: schema.status ?? 'draft',
      keep_alive: schema.keepAlive ?? true,
      schema: schema as unknown as Record<string, unknown>,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      published_at: schema.status === 'published' ? new Date().toISOString() : existing?.published_at ?? null
    };

    let savedPage: LowCodePageRow | null = null;

    if (existing) {
      const { data, error } = await client
        .from('lowcode_pages')
        .update(pagePayload)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      savedPage = data as LowCodePageRow;
    } else {
      const { data, error } = await client
        .from('lowcode_pages')
        .insert({
          ...pagePayload,
          created_by: user.id
        })
        .select('*')
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      savedPage = data as LowCodePageRow;
    }

    const { error: versionError } = await client.from('lowcode_page_versions').insert({
      page_id: savedPage.id,
      version: nextVersion,
      schema: schema as unknown as Record<string, unknown>,
      created_by: user.id,
      published_at: schema.status === 'published' ? new Date().toISOString() : null
    });

    if (versionError) {
      throw new BadRequestException(versionError.message);
    }

    return normalizePageRow(savedPage);
  }

  private async publishPage(postData: Record<string, unknown>, context: ServiceContext) {
    const code = typeof postData.code === 'string' ? postData.code.trim() : '';
    if (!code) {
      throw new BadRequestException('code is required.');
    }

    const saved = await this.savePage(
      {
        code,
        schema: {
          ...(isRecord(postData.schema) ? postData.schema : {}),
          code,
          status: 'published'
        }
      },
      context
    );

    return {
      success: true,
      page: saved
    };
  }

  private async archivePage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'lowcode.pages.manage');
    const code = typeof postData.code === 'string' ? postData.code.trim() : '';

    if (!code) {
      throw new BadRequestException('code is required.');
    }

    const { data: existing, error: lookupError } = await client
      .from('lowcode_pages')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (lookupError) {
      throw new BadRequestException(lookupError.message);
    }

    if (!existing) {
      throw new NotFoundException('Low-code page not found.');
    }

    const { data, error } = await client
      .from('lowcode_pages')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return normalizePageRow(data as LowCodePageRow);
  }

}
