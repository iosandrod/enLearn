import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  BaseService,
  type ResourceConfigMap
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission,
  requireAdmin
} from '../common/utils/supabase';
import { requireActiveAccount } from '../common/utils/account-context';
import {
  ADMIN_NAVIGATION_SELECT,
  selectAuthorizedNavigationRoutes
} from '../admin-service/admin-navigation';
import {
  asRows,
  normalizeGeneratedStatus,
  readString
} from './lowcode.helpers';
import { lowCodeResources } from './lowcode.resources';
import type { LowCodePageRow } from './lowcode.types';
import {
  LowCodeSchemaValidationError,
  prepareLowCodePageSchema
} from './lowcode.schema';
import {
  buildTableListPageSchemaFromMetadata,
  mapDatabaseTableOptions,
  normalizeDatabaseColumns,
  readTableRef
} from './table-page-generator';

@Injectable()
export class LowCodeService extends BaseService {
  protected override async saveItem(
    postData: Parameters<BaseService['execute']>[1],
    context: ServiceContext
  ) {
    return super.saveItem(this.preparePageWrite(postData), context);
  }

  private preparePageWrite(postData: Parameters<BaseService['execute']>[1]) {
    const resource = readString(postData.resource);
    if (resource !== 'lowcode_pages') return postData;

    const data = this.isRecord(postData.data) ? postData.data : postData;
    if (!Object.prototype.hasOwnProperty.call(data, 'schema')) return postData;

    let schema;
    try {
      this.assertRuntimeBlockArrays(data.schema);
      schema = prepareLowCodePageSchema(data.schema);
    } catch (error) {
      if (error instanceof LowCodeSchemaValidationError) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'LOW_CODE_SCHEMA_VALIDATION_FAILED',
          error: 'Low-code page schema validation failed',
          message: error.message,
          issues: error.issues
        });
      }
      throw error;
    }

    if (data === postData) return { ...postData, schema };
    return { ...postData, data: { ...data, schema } };
  }

  private assertRuntimeBlockArrays(value: unknown) {
    if (!this.isRecord(value)) return;

    const visitBlocks = (blocks: unknown, path: string) => {
      if (!Array.isArray(blocks)) {
        throw new BadRequestException(`${path}: Blocks must be an array.`);
      }

      blocks.forEach((candidate, index) => {
        const blockPath = `${path}.${index}`;
        if (!this.isRecord(candidate)) {
          throw new BadRequestException(`${blockPath}: Block must be an object.`);
        }

        if (Object.prototype.hasOwnProperty.call(candidate, 'blocks')) {
          visitBlocks(candidate.blocks, `${blockPath}.blocks`);
        }
        if (Object.prototype.hasOwnProperty.call(candidate, 'overlays')) {
          visitBlocks(candidate.overlays, `${blockPath}.overlays`);
        }
        if (Object.prototype.hasOwnProperty.call(candidate, 'tabs')) {
          if (!Array.isArray(candidate.tabs)) {
            throw new BadRequestException(`${blockPath}.tabs: Tabs must be an array.`);
          }
          candidate.tabs.forEach((tab, tabIndex) => {
            const tabPath = `${blockPath}.tabs.${tabIndex}`;
            if (!this.isRecord(tab)) {
              throw new BadRequestException(`${tabPath}: Tab pane must be an object.`);
            }
            visitBlocks(tab.blocks, `${tabPath}.blocks`);
          });
        }
      });
    };

    visitBlocks(value.blocks, 'blocks');
    if (Object.prototype.hasOwnProperty.call(value, 'overlays')) {
      visitBlocks(value.overlays, 'overlays');
    }
  }

  protected override async listItems(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (this.isRuntimePageCompatibilityRequest(postData)) {
      return [await this.getRuntimePage(this.runtimePageLookup(postData), context)];
    }

    return super.listItems(postData, context);
  }

  protected override resources(): ResourceConfigMap {
    return lowCodeResources;
  }

  protected override async executeAction(method: string, postData: Record<string, unknown>, context: ServiceContext) {
    switch (method) {
      case 'listTablePageOptions':
        return this.listTablePageOptions(context);
      case 'listTableColumns':
        return this.listTableColumns(postData, context);
      case 'generateTableListPageSchema':
        return this.generateTableListPageSchema(postData, context);
      case 'saveGeneratedTableListPage':
        return this.saveGeneratedTableListPage(postData, context);
      case 'getRuntimePage':
        return this.getRuntimePage(postData, context);
      default:
        throw new BadRequestException(`Unsupported lowcode method: ${method}`);
    }
  }

  private async getRuntimePage(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const requestedId = readString(postData.id ?? postData.pageId ?? postData.page_id);
    const requestedCode = readString(postData.code ?? postData.pageCode ?? postData.page_code);
    const requestedRoute = readString(postData.route ?? postData.path);
    const sourcePageCode = readString(
      postData.fromPage ?? postData.from_page ?? postData.sourcePage ?? postData.source_page
    );
    if (!requestedId && !requestedCode && !requestedRoute) {
      throw new BadRequestException('id, code, or route is required.');
    }

    const activeAccount = await requireActiveAccount(context);
    const { client, user } = await getCurrentUser(activeAccount.context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: activeAccount.context.accountId
    });
    const adminClient = createSupabaseClient('admin', activeAccount.context);
    const { data: routeRows, error: routeError } = await adminClient
      .from('admin_routes')
      .select(ADMIN_NAVIGATION_SELECT)
      .order('sort_order', { ascending: true })
      .limit(2000);

    if (routeError) throw new BadRequestException(routeError.message);

    const authorizedRoutes = selectAuthorizedNavigationRoutes(
      routeRows ?? [],
      authorization.permissionCodes,
      authorization.isLegacyAdmin
    );
    const canManagePages = hasRequiredPermission(authorization, 'lowcode.pages.manage');

    let pageQuery = adminClient
      .from('lowcode_pages')
      .select('*');
    pageQuery = requestedId
      ? pageQuery.eq('id', requestedId)
      : requestedCode
        ? pageQuery.eq('code', requestedCode)
        : pageQuery.eq('route', requestedRoute);
    pageQuery = pageQuery.limit(1);
    if (!canManagePages) pageQuery = pageQuery.eq('status', 'published');
    const { data: pages, error: pageError } = await pageQuery;

    if (pageError) throw new BadRequestException(pageError.message);
    const page = pages?.[0];
    if (!page) {
      throw new NotFoundException(
        `Low-code page "${requestedId || requestedCode || requestedRoute}" was not found.`
      );
    }

    if (!canManagePages) {
      const authorizedPageCodes = [
        ...new Set(
          authorizedRoutes
            .map((route) => route.page_code)
            .filter((code): code is string => Boolean(code))
        )
      ];
      const directlyAuthorized = authorizedRoutes.some((route) => {
        const placement = route.metadata?.mobileNavigation ?? route.metadata?.navigation;
        return route.page_code === String(page.code ?? '') && placement !== 'hidden';
      });
      let linkedEditPage = false;

      if (
        !directlyAuthorized &&
        sourcePageCode &&
        authorizedPageCodes.includes(sourcePageCode)
      ) {
        const { data: sourcePages, error: sourcePagesError } = await adminClient
          .from('lowcode_pages')
          .select('code, edit_page_id')
          .eq('code', sourcePageCode)
          .eq('status', 'published')
          .limit(1);
        if (sourcePagesError) throw new BadRequestException(sourcePagesError.message);
        linkedEditPage = (sourcePages ?? []).some(
          (sourcePage) =>
            sourcePage.code === sourcePageCode && sourcePage.edit_page_id === page.id
        );
      }

      if (!directlyAuthorized && !linkedEditPage) {
        throw new ForbiddenException('The requested page is not available in your navigation.');
      }
    }

    return this.prepareRuntimePage(page, authorization);
  }

  protected prepareRuntimePage(
    page: Record<string, unknown>,
    authorization: Awaited<ReturnType<typeof getUserAuthorization>>
  ) {
    const schema = page.schema && typeof page.schema === 'object' && !Array.isArray(page.schema)
      ? structuredClone(page.schema as Record<string, unknown>)
      : {};
    const moduleName = schema && typeof schema === 'object'
      ? readString((schema as Record<string, unknown>).code).split('_')[0]
      : '';
    if (moduleName === 'mes') {
      const canManageMes = hasRequiredPermission(
        authorization,
        'mes.execution.manage'
      );
      this.applyMesRuntimeAccess(schema, canManageMes);
      return {
        ...page,
        schema,
        runtime_capabilities: { mes: { canManage: canManageMes } }
      };
    }

    if (moduleName !== 'planning') return page;

    const canManagePlanning = hasRequiredPermission(
      authorization,
      'planning.models.manage'
    );
    this.applyPlanningRuntimeAccess(schema, canManagePlanning);

    return {
      ...page,
      schema,
      runtime_capabilities: { planning: { canManage: canManagePlanning } }
    };
  }

  protected applyPlanningRuntimeAccess(schema: Record<string, unknown>, canManage: boolean) {
    const managementActions = new Set([
      'create',
      'save',
      'preflight',
      'run',
      'cancel',
      'publish'
    ]);
    const visit = (values: unknown[]) => {
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const block = value as Record<string, unknown>;
        if (block.kind === 'buttonGroup' && Array.isArray(block.actions)) {
          block.actions = (block.actions as Array<Record<string, unknown>>).filter(
            (action) => canManage || (
              readString(action.permissionCode) !== 'planning.models.manage' &&
              !managementActions.has(readString(action.code))
            )
          );
        }
        if (block.kind === 'grid') {
          const blockSchema = block.schema && typeof block.schema === 'object' && !Array.isArray(block.schema)
            ? block.schema as Record<string, unknown>
            : undefined;
          if (blockSchema && !canManage) {
            blockSchema.rowActions = { edit: false, delete: false, actions: [] };
            const grid = blockSchema.grid && typeof blockSchema.grid === 'object' && !Array.isArray(blockSchema.grid)
              ? blockSchema.grid as Record<string, unknown>
              : undefined;
            if (grid && Array.isArray(grid.columns)) {
              grid.columns = (grid.columns as Array<Record<string, unknown>>).filter(
                (column) => !(column.slots && typeof column.slots === 'object' &&
                  (column.slots as Record<string, unknown>).default === 'actions')
              );
            }
          }
        }
        if (Array.isArray(block.blocks)) visit(block.blocks);
        if (Array.isArray(block.tabs)) {
          for (const tab of block.tabs as Array<Record<string, unknown>>) {
            if (Array.isArray(tab.blocks)) visit(tab.blocks);
          }
        }
      }
    };

    if (Array.isArray(schema.blocks)) visit(schema.blocks);
    if (Array.isArray(schema.overlays)) visit(schema.overlays);
  }

  protected applyMesRuntimeAccess(schema: Record<string, unknown>, canManage: boolean) {
    if (canManage) return;

    const visit = (values: unknown[]) => {
      for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const block = value as Record<string, unknown>;
        if (block.kind === 'buttonGroup' && Array.isArray(block.actions)) {
          block.actions = (block.actions as Array<Record<string, unknown>>).filter(
            (action) => readString(action.permissionCode) !== 'mes.execution.manage'
          );
        }
        if (block.kind === 'grid') {
          const blockSchema = block.schema && typeof block.schema === 'object' && !Array.isArray(block.schema)
            ? block.schema as Record<string, unknown>
            : undefined;
          if (blockSchema) {
            const rowActions = blockSchema.rowActions && typeof blockSchema.rowActions === 'object' &&
              !Array.isArray(blockSchema.rowActions)
              ? blockSchema.rowActions as Record<string, unknown>
              : undefined;
            if (rowActions && Array.isArray(rowActions.actions)) {
              rowActions.actions = (rowActions.actions as Array<Record<string, unknown>>).filter(
                (action) => readString(action.permissionCode) !== 'mes.execution.manage'
              );
            }
          }
        }
        if (Array.isArray(block.blocks)) visit(block.blocks);
        if (Array.isArray(block.tabs)) {
          for (const tab of block.tabs as Array<Record<string, unknown>>) {
            if (Array.isArray(tab.blocks)) visit(tab.blocks);
          }
        }
        if (Array.isArray(block.overlays)) visit(block.overlays);
      }
    };

    if (Array.isArray(schema.blocks)) visit(schema.blocks);
    if (Array.isArray(schema.overlays)) visit(schema.overlays);
  }

  private isRuntimePageCompatibilityRequest(postData: Record<string, unknown>) {
    const tableName = readString(postData.tableName ?? postData.table_name);
    const resource = readString(postData.resource);
    if (tableName !== 'lowcode_pages' || resource) return false;

    const filters = postData.filters && typeof postData.filters === 'object' &&
      !Array.isArray(postData.filters)
      ? postData.filters as Record<string, unknown>
      : {};
    return Boolean(
      readString(filters.id) || readString(filters.code) || readString(filters.route)
    ) && Number(postData.limit ?? 0) === 1;
  }

  private runtimePageLookup(postData: Record<string, unknown>) {
    const filters = postData.filters as Record<string, unknown>;
    return {
      id: filters.id,
      code: filters.code,
      route: filters.route,
      fromPage: postData.fromPage ?? postData.from_page
    };
  }

  private async listTablePageOptions(context: ServiceContext) {
    const { client } = await requireAdmin(context, ['lowcode.pages.manage', 'admin.entities.manage']);
    const { data, error } = await client.rpc('read_lowcode_table_metadata', {
      p_action: 'list_tables',
      p_payload: {}
    });
    if (error) throw new BadRequestException(error.message);
    return mapDatabaseTableOptions(data);
  }

  private async listTableColumns(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const { client } = await requireAdmin(context, ['lowcode.pages.manage', 'admin.entities.manage']);
    const table = readTableRef(postData.tableName ?? postData.table_name);
    const { data, error } = await client.rpc('read_lowcode_table_metadata', {
      p_action: 'inspect_table',
      p_payload: { schema_name: table.schema, table_name: table.name }
    });
    if (error) throw new BadRequestException(error.message);

    const columns = data && typeof data === 'object' && !Array.isArray(data)
      ? (data as { columns?: unknown }).columns
      : undefined;
    return normalizeDatabaseColumns(columns);
  }

  private async generateTableListPageSchema(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const { client } = await requireAdmin(context, ['lowcode.pages.manage', 'admin.entities.manage']);
    const tableName = readString(postData.tableName ?? postData.table_name);
    const code = readString(postData.code);
    const route = readString(postData.route);
    const title = readString(postData.title);
    const description = readString(postData.description);

    if (!tableName) {
      throw new BadRequestException('tableName is required.');
    }

    try {
      const table = readTableRef(tableName);
      const { data, error } = await client.rpc('read_lowcode_table_metadata', {
        p_action: 'inspect_table',
        p_payload: { schema_name: table.schema, table_name: table.name }
      });
      if (error) throw new Error(error.message);
      return buildTableListPageSchemaFromMetadata(data, {
          tableName,
          ...(code ? { code } : {}),
          ...(route ? { route } : {}),
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          status: normalizeGeneratedStatus(postData.status)
        });
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
    const [existingPage] = asRows(await this.listItems({
      resource: 'lowcode_pages',
      filters: { code: schema.code },
      limit: 1
    }, context)) as LowCodePageRow[];
    const nextVersion = (existingPage?.version ?? 0) + 1;
    const now = new Date().toISOString();

    return this.saveItem({
      resource: 'lowcode_pages',
      ...(existingPage ? { id: existingPage.id } : {}),
      data: {
        code: schema.code,
        route: schema.route,
        title: schema.title,
        description: schema.description ?? null,
        layout: schema.layout ?? 'dashboard',
        status: schema.status ?? 'draft',
        keep_alive: schema.keepAlive ?? true,
        page_type: schema.pageType ?? 'custom',
        edit_page_id: existingPage?.edit_page_id ?? null,
        schema: schema as unknown as Record<string, unknown>,
        version: nextVersion,
        published_at: schema.status === 'published'
          ? now
          : existingPage?.published_at ?? null
      }
    }, context);
  }

}
