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
import { withPostgresClient } from '../common/utils/database';
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
import {
  buildTableListPageSchemaFromDatabase,
  listDatabaseTableOptions
} from './table-page-generator';

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

type LowCodePageOpenType = 'page' | 'drawer' | 'modal';

type LowCodePageRelationPageRow = {
  id: string;
  code: string;
  route: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
};

type LowCodePageRelationRow = {
  id: string;
  source_page_id: string;
  action_key: string;
  target_page_id: string;
  open_type: LowCodePageOpenType;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  source_page?: LowCodePageRelationPageRow | LowCodePageRelationPageRow[] | null;
  target_page?: LowCodePageRelationPageRow | LowCodePageRelationPageRow[] | null;
};

type LowCodePageRelation = {
  id: string;
  sourcePageId: string;
  sourcePageCode: string;
  sourcePageRoute?: string;
  sourcePageTitle?: string;
  actionKey: string;
  targetPageId: string;
  targetPageCode: string;
  targetPageRoute?: string;
  targetPageTitle?: string;
  openType: LowCodePageOpenType;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type LowCodePageRelations = {
  outgoing: LowCodePageRelation[];
  incoming: LowCodePageRelation[];
};

type LowCodePageRelationInput = {
  sourcePageCode?: string;
  targetPageCode?: string;
  actionKey?: string;
  openType?: LowCodePageOpenType;
  metadata?: Record<string, unknown>;
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

function createEmptyRelations(): LowCodePageRelations {
  return {
    outgoing: [],
    incoming: []
  };
}

function isMissingRelationTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  const message = error.message ?? '';

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.lowcode_page_relations'") ||
    (message.includes('lowcode_page_relations') && message.includes('schema cache'))
  );
}

function normalizePageRow(row: LowCodePageRow, relations?: LowCodePageRelations) {
  return {
    ...row,
    schema: normalizeSchema(row.schema),
    ...(relations ? { relations } : {})
  };
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOpenType(value: unknown): LowCodePageOpenType {
  return value === 'drawer' || value === 'modal' || value === 'page' ? value : 'page';
}

function normalizeActionKey(value: unknown, fallback = 'edit') {
  return readString(value, fallback);
}

function readMetadata(value: unknown) {
  return isRecord(value) ? value : {};
}

function readRelationPage(
  value?: LowCodePageRelationPageRow | LowCodePageRelationPageRow[] | null
) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeRelationRow(row: LowCodePageRelationRow): LowCodePageRelation {
  const sourcePage = readRelationPage(row.source_page);
  const targetPage = readRelationPage(row.target_page);

  return {
    id: row.id,
    sourcePageId: row.source_page_id,
    sourcePageCode: sourcePage?.code ?? '',
    ...(sourcePage?.route ? { sourcePageRoute: sourcePage.route } : {}),
    ...(sourcePage?.title ? { sourcePageTitle: sourcePage.title } : {}),
    actionKey: row.action_key,
    targetPageId: row.target_page_id,
    targetPageCode: targetPage?.code ?? '',
    ...(targetPage?.route ? { targetPageRoute: targetPage.route } : {}),
    ...(targetPage?.title ? { targetPageTitle: targetPage.title } : {}),
    openType: normalizeOpenType(row.open_type),
    metadata: readMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeGeneratedStatus(value: unknown): 'draft' | 'published' | 'archived' {
  return value === 'draft' || value === 'archived' ? value : 'published';
}

@Injectable()
export class LowCodeService implements ServiceExecutor {
  async execute(method: string, postData: Record<string, unknown>, context: ServiceContext) {
    switch (method) {
      case 'listItems':
        return this.listItems(postData, context);
      case 'getPage':
        return this.getPage(postData, context);
      case 'generateTableListPageSchema':
        return this.generateTableListPageSchema(postData, context);
      case 'saveGeneratedTableListPage':
        return this.saveGeneratedTableListPage(postData, context);
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

  private async listItems(postData: Record<string, unknown>, context: ServiceContext) {
    switch (readString(postData.itemType ?? postData.item_type ?? postData.type, 'pages')) {
      case 'pages':
        return this.listPages(context);
      case 'pageRelations':
        return this.listPageRelations(postData, context);
      case 'tablePageOptions':
        return this.listTablePageOptions(context);
      default:
        throw new BadRequestException('Unsupported lowcode listItems itemType.');
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

    return Promise.all(
      (data ?? []).map(async (row) => {
        const page = row as LowCodePageRow;
        return normalizePageRow(page, await this.getRelationsForPage(client, page.id));
      })
    );
  }

  private async getPage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const code = readString(postData.code);
    const route = readString(postData.route);
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

    const pageRow = data as LowCodePageRow;
    const page = normalizePageRow(pageRow, await this.getRelationsForPage(client, pageRow.id));
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

  private relationSelect() {
    return `
      id,
      source_page_id,
      action_key,
      target_page_id,
      open_type,
      metadata,
      created_at,
      updated_at,
      source_page:source_page_id(id, code, route, title, status),
      target_page:target_page_id(id, code, route, title, status)
    `;
  }

  private async findRelationPageByCode(
    client: ReturnType<typeof createSupabaseClient>,
    code: string,
    role: 'source' | 'target'
  ) {
    const { data, error } = await client
      .from('lowcode_pages')
      .select('id, code, route, title, status')
      .eq('code', code)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new BadRequestException(`${role} page "${code}" does not exist.`);
    }

    return data as LowCodePageRelationPageRow;
  }

  private async getRelationsForPage(
    client: ReturnType<typeof createSupabaseClient>,
    pageId: string
  ): Promise<LowCodePageRelations> {
    const select = this.relationSelect();
    const [outgoingResult, incomingResult] = await Promise.all([
      client
        .from('lowcode_page_relations')
        .select(select)
        .eq('source_page_id', pageId)
        .order('action_key', { ascending: true }),
      client
        .from('lowcode_page_relations')
        .select(select)
        .eq('target_page_id', pageId)
        .order('action_key', { ascending: true })
    ]);

    if (outgoingResult.error) {
      if (isMissingRelationTableError(outgoingResult.error)) {
        return createEmptyRelations();
      }

      throw new BadRequestException(outgoingResult.error.message);
    }

    if (incomingResult.error) {
      if (isMissingRelationTableError(incomingResult.error)) {
        return createEmptyRelations();
      }

      throw new BadRequestException(incomingResult.error.message);
    }

    return {
      outgoing: ((outgoingResult.data ?? []) as unknown as LowCodePageRelationRow[]).map(
        normalizeRelationRow
      ),
      incoming: ((incomingResult.data ?? []) as unknown as LowCodePageRelationRow[]).map(
        normalizeRelationRow
      )
    };
  }

  private async listPageRelations(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const { client } = await requireAdmin(context, 'lowcode.pages.manage');
    const code = readString(postData.code ?? postData.pageCode);

    if (code) {
      const page = await this.findRelationPageByCode(client, code, 'source');
      return this.getRelationsForPage(client, page.id);
    }

    const { data, error } = await client
      .from('lowcode_page_relations')
      .select(this.relationSelect())
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingRelationTableError(error)) {
        return [];
      }

      throw new BadRequestException(error.message);
    }

    return ((data ?? []) as unknown as LowCodePageRelationRow[]).map(normalizeRelationRow);
  }

  private async listTablePageOptions(context: ServiceContext) {
    await requireAdmin(context, ['lowcode.pages.manage', 'admin.entities.manage']);
    return withPostgresClient((client) => listDatabaseTableOptions(client));
  }

  private async generateTableListPageSchema(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    await requireAdmin(context, ['lowcode.pages.manage', 'admin.entities.manage']);
    const tableName = readString(postData.tableName ?? postData.table_name);
    const code = readString(postData.code);
    const route = readString(postData.route);
    const title = readString(postData.title);
    const description = readString(postData.description);

    if (!tableName) {
      throw new BadRequestException('tableName is required.');
    }

    try {
      return await withPostgresClient((client) =>
        buildTableListPageSchemaFromDatabase(client, {
          tableName,
          ...(code ? { code } : {}),
          ...(route ? { route } : {}),
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          status: normalizeGeneratedStatus(postData.status)
        })
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not generate page schema.'
      );
    }
  }

  private async saveGeneratedTableListPage(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const schema = await this.generateTableListPageSchema(postData, context);
    return this.savePage(
      {
        code: schema.code,
        schema
      },
      context
    );
  }

  private normalizeRelationInput(
    value: unknown,
    savedPage: LowCodePageRow
  ): LowCodePageRelationInput | null {
    if (!isRecord(value)) return null;

    const sourcePageCode = readString(
      value.sourcePageCode ?? value.source_page_code,
      savedPage.code
    );
    let targetPageCode = readString(value.targetPageCode ?? value.target_page_code);

    if (!targetPageCode && sourcePageCode && sourcePageCode !== savedPage.code) {
      targetPageCode = savedPage.code;
    }

    if (!sourcePageCode || !targetPageCode) {
      throw new BadRequestException('Relation requires sourcePageCode and targetPageCode.');
    }

    return {
      sourcePageCode,
      targetPageCode,
      actionKey: normalizeActionKey(value.actionKey ?? value.action_key),
      openType: normalizeOpenType(value.openType ?? value.open_type),
      metadata: readMetadata(value.metadata)
    };
  }

  private collectRelationInputs(
    postData: Record<string, unknown>,
    savedPage: LowCodePageRow
  ) {
    const relationInputs: LowCodePageRelationInput[] = [];
    const relation = this.normalizeRelationInput(postData.relation, savedPage);

    if (relation) {
      relationInputs.push(relation);
    }

    if (Array.isArray(postData.relations)) {
      postData.relations.forEach((item) => {
        const input = this.normalizeRelationInput(item, savedPage);
        if (input) relationInputs.push(input);
      });
    }

    const editPageCode = readString(postData.editPageCode ?? postData.edit_page_code);
    if (editPageCode) {
      relationInputs.push({
        sourcePageCode: savedPage.code,
        targetPageCode: editPageCode,
        actionKey: 'edit',
        openType: normalizeOpenType(postData.editOpenType ?? postData.openType),
        metadata: readMetadata(postData.editRelationMetadata)
      });
    }

    const parentListPageCode = readString(
      postData.parentListPageCode ?? postData.listPageCode ?? postData.sourcePageCode
    );
    if (parentListPageCode) {
      relationInputs.push({
        sourcePageCode: parentListPageCode,
        targetPageCode: savedPage.code,
        actionKey: normalizeActionKey(postData.actionKey, 'edit'),
        openType: normalizeOpenType(postData.openType ?? postData.editOpenType),
        metadata: readMetadata(postData.relationMetadata)
      });
    }

    const seen = new Set<string>();
    return relationInputs.filter((input) => {
      const key = `${input.sourcePageCode}:${input.actionKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async upsertPageRelation(
    client: ReturnType<typeof createSupabaseClient>,
    userId: string,
    input: LowCodePageRelationInput
  ) {
    const sourcePageCode = readString(input.sourcePageCode);
    const targetPageCode = readString(input.targetPageCode);
    const actionKey = normalizeActionKey(input.actionKey);

    if (!sourcePageCode || !targetPageCode) {
      throw new BadRequestException('Relation requires sourcePageCode and targetPageCode.');
    }

    if (sourcePageCode === targetPageCode) {
      throw new BadRequestException('A page cannot be related to itself.');
    }

    const [sourcePage, targetPage] = await Promise.all([
      this.findRelationPageByCode(client, sourcePageCode, 'source'),
      this.findRelationPageByCode(client, targetPageCode, 'target')
    ]);

    const relationPayload = {
      source_page_id: sourcePage.id,
      action_key: actionKey,
      target_page_id: targetPage.id,
      open_type: normalizeOpenType(input.openType),
      metadata: input.metadata ?? {},
      updated_by: userId,
      updated_at: new Date().toISOString()
    };

    const { data: existing, error: lookupError } = await client
      .from('lowcode_page_relations')
      .select('id')
      .eq('source_page_id', sourcePage.id)
      .eq('action_key', actionKey)
      .maybeSingle();

    if (lookupError) {
      if (isMissingRelationTableError(lookupError)) {
        throw new BadRequestException(
          'Low-code page relation table is not created yet. Run supabase/migrations/20260728040000_lowcode_page_relations.sql first.'
        );
      }

      throw new BadRequestException(lookupError.message);
    }

    if (existing) {
      const { error } = await client
        .from('lowcode_page_relations')
        .update(relationPayload)
        .eq('id', (existing as { id: string }).id);

      if (error) {
        throw new BadRequestException(error.message);
      }
    } else {
      const { error } = await client.from('lowcode_page_relations').insert({
        ...relationPayload,
        created_by: userId
      });

      if (error) {
        throw new BadRequestException(error.message);
      }
    }

    return {
      sourcePageId: sourcePage.id,
      targetPageId: targetPage.id,
      actionKey
    };
  }

  private async syncPageRelations(
    client: ReturnType<typeof createSupabaseClient>,
    userId: string,
    savedPage: LowCodePageRow,
    postData: Record<string, unknown>
  ) {
    const relationInputs = this.collectRelationInputs(postData, savedPage);
    const syncedRelations: Array<{
      sourcePageId: string;
      targetPageId: string;
      actionKey: string;
    }> = [];

    for (const input of relationInputs) {
      syncedRelations.push(await this.upsertPageRelation(client, userId, input));
    }

    const incomingEditRelations = syncedRelations.filter(
      (relation) => relation.targetPageId === savedPage.id && relation.actionKey === 'edit'
    );

    for (const relation of incomingEditRelations) {
      const { error } = await client
        .from('lowcode_page_relations')
        .delete()
        .eq('target_page_id', savedPage.id)
        .eq('action_key', relation.actionKey)
        .neq('source_page_id', relation.sourcePageId);

      if (error) {
        throw new BadRequestException(error.message);
      }
    }

    return this.getRelationsForPage(client, savedPage.id);
  }

  private assertEditPageHasListRelation(savedPage: LowCodePageRow, relations: LowCodePageRelations) {
    if (savedPage.schema.pageType !== 'edit') return;

    const hasListRelation = relations.incoming.some(
      (relation) => relation.actionKey === 'edit' && relation.sourcePageCode
    );

    if (hasListRelation) return;

    throw new BadRequestException(
      'Edit page must be linked to a list page. Pass parentListPageCode when saving the page.'
    );
  }

  private async savePage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'lowcode.pages.manage');
    const schema = normalizeSchema(postData.schema ?? postData, true);
    const existingCode = readString(postData.code, schema.code);

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

    const existingPage = existing as LowCodePageRow | null;
    const nextVersion = (existingPage?.version ?? 0) + 1;
    const now = new Date().toISOString();
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
      updated_at: now,
      updated_by: user.id,
      published_at: schema.status === 'published' ? now : existingPage?.published_at ?? null
    };

    let savedPage: LowCodePageRow | null = null;

    if (existingPage) {
      const { data, error } = await client
        .from('lowcode_pages')
        .update(pagePayload)
        .eq('id', existingPage.id)
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
      published_at: schema.status === 'published' ? now : null
    });

    if (versionError) {
      throw new BadRequestException(versionError.message);
    }

    const relations = await this.syncPageRelations(client, user.id, savedPage, postData);
    this.assertEditPageHasListRelation(savedPage, relations);

    return normalizePageRow(savedPage, relations);
  }

  private async publishPage(postData: Record<string, unknown>, context: ServiceContext) {
    const code = readString(postData.code);
    if (!code) {
      throw new BadRequestException('code is required.');
    }

    const saved = await this.savePage(
      {
        code,
        parentListPageCode: postData.parentListPageCode,
        listPageCode: postData.listPageCode,
        sourcePageCode: postData.sourcePageCode,
        actionKey: postData.actionKey,
        openType: postData.openType,
        editOpenType: postData.editOpenType,
        relation: postData.relation,
        relations: postData.relations,
        relationMetadata: postData.relationMetadata,
        editPageCode: postData.editPageCode,
        edit_page_code: postData.edit_page_code,
        editRelationMetadata: postData.editRelationMetadata,
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
    const code = readString(postData.code);

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
