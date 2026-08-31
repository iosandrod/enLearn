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
  executeLowCodeRemoteRuntime,
  LOW_CODE_REMOTE_EFFECT_CAPABILITIES,
  type LowCodeRemoteRuntimeSnapshot
} from './lowcode-runtime.executor';
import {
  LowCodeSchemaValidationError,
  migrateLowCodePageSchema,
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
    const prepared = this.preparePageWrite(postData);
    const result = await super.saveItem(prepared, context);
    if (readString(prepared.resource) !== 'lowcode_pages' || !this.isRecord(result)) {
      return result;
    }

    const activeAccount = await requireActiveAccount(context);
    const client = createSupabaseClient('admin', activeAccount.context);
    return {
      ...result,
      node_actions: await this.readActiveNodeActions(client)
    };
  }

  private preparePageWrite(postData: Parameters<BaseService['execute']>[1]) {
    const resource = readString(postData.resource);
    if (resource !== 'lowcode_pages') return postData;

    const data = this.isRecord(postData.data) ? postData.data : postData;
    const normalizedTableName = this.normalizePageTableName(data.table_name);
    const normalizedData = normalizedTableName === data.table_name
      ? data
      : { ...data, table_name: normalizedTableName };
    if (!Object.prototype.hasOwnProperty.call(normalizedData, 'schema')) {
      if (normalizedData === data) return postData;
      return data === postData
        ? normalizedData
        : { ...postData, data: normalizedData };
    }

    let schema;
    try {
      this.assertRuntimeBlockArrays(normalizedData.schema);
      schema = prepareLowCodePageSchema(normalizedData.schema);
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

    if (data === postData) return { ...normalizedData, schema };
    return { ...postData, data: { ...normalizedData, schema } };
  }

  private normalizePageTableName(value: unknown) {
    if (typeof value !== 'string') return value;
    return value.trim().replace(/^public\./i, '');
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
      case 'listDefaultValueProcedures':
        return this.listDefaultValueProcedures(context);
      case 'executeDefaultValueProcedure':
        return this.executeDefaultValueProcedure(postData, context);
      case 'generateTableListPageSchema':
        return this.generateTableListPageSchema(postData, context);
      case 'saveGeneratedTableListPage':
        return this.saveGeneratedTableListPage(postData, context);
      case 'getRuntimePage':
        return this.getRuntimePage(postData, context);
      case 'executeRuntime':
        return this.executeRuntime(postData, context);
      default:
        return super.executeAction(method, postData, context);
    }
  }

  private async executeRuntime(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const pageId = readString(postData.pageId ?? postData.page_id ?? postData.id);
    const pageCode = readString(postData.pageCode ?? postData.page_code ?? postData.code);
    const pageRoute = readString(postData.pageRoute ?? postData.page_route ?? postData.route);
    const runtimeKey = readString(postData.runtimeKey ?? postData.runtime_key);
    const functionName = readString(postData.functionName ?? postData.function_name);
    if (!pageId && !pageCode && !pageRoute) {
      throw new BadRequestException('pageId, pageCode, or pageRoute is required.');
    }
    if (!runtimeKey && !functionName) {
      throw new BadRequestException('runtimeKey or functionName is required.');
    }

    const page = await this.getRuntimePage({
      ...(pageId ? { id: pageId } : {}),
      ...(pageCode ? { code: pageCode } : {}),
      ...(pageRoute ? { route: pageRoute } : {}),
      fromPage: postData.fromPage ?? postData.from_page
    }, context) as Record<string, unknown>;
    const runtimeFunctionsValue = page.runtime_functions;
    const runtimeFunctions = Array.isArray(runtimeFunctionsValue)
      ? runtimeFunctionsValue.filter((item): item is Record<string, unknown> => this.isRecord(item))
      : [];
    const runtimeFunction = runtimeFunctions
      .filter((item) =>
        (runtimeKey ? readString(item.runtime_key) === runtimeKey : true) &&
        (functionName ? readString(item.function_name) === functionName : true) &&
        readString(item.function_type) === 'page_function'
      )
      .sort((left, right) => {
        const pageId = readString(page.id);
        const leftPage = readString(left.page_id) === pageId ? 1 : 0;
        const rightPage = readString(right.page_id) === pageId ? 1 : 0;
        return rightPage - leftPage || Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
      })[0];
    if (!runtimeFunction) {
      throw new NotFoundException('Published runtime function was not found for this page.');
    }
    if (readString(runtimeFunction.execution_mode) !== 'script') {
      throw new BadRequestException({
        code: 'LOW_CODE_RUNTIME_NOT_REMOTE',
        message: 'This runtime function still requires a native browser adapter.'
      });
    }
    const capabilities = Array.isArray(runtimeFunction.capabilities)
      ? runtimeFunction.capabilities.filter(
          (item): item is string => typeof item === 'string' && Boolean(item.trim())
        )
      : [];
    const activeCapabilities = new Set(
      runtimeFunctions
        .filter((item) =>
          readString(item.function_type) === 'capability' &&
          item.enabled !== false &&
          readString(item.status) === 'published'
        )
        .map((item) => readString(item.function_name))
        .filter(Boolean)
    );
    const unavailableCapabilities = capabilities.filter((capability) =>
      !activeCapabilities.has(capability)
    );
    if (unavailableCapabilities.length) {
      throw new BadRequestException({
        code: 'LOW_CODE_REMOTE_CAPABILITY_DISABLED',
        message: `数据库运行时能力未启用：${unavailableCapabilities.join(', ')}`
      });
    }
    const unsupportedCapabilities = capabilities.filter((capability) =>
      !LOW_CODE_REMOTE_EFFECT_CAPABILITIES.includes(
        capability as typeof LOW_CODE_REMOTE_EFFECT_CAPABILITIES[number]
      )
    );
    if (unsupportedCapabilities.length) {
      throw new BadRequestException({
        code: 'LOW_CODE_REMOTE_CAPABILITY_UNSUPPORTED',
        message: `远程页面函数暂不支持这些能力：${unsupportedCapabilities.join(', ')}`
      });
    }

    const args = this.isRecord(postData.args) ? postData.args : {};
    const requestedSnapshot = this.isRecord(postData.context) ? postData.context : {};
    const snapshot: LowCodeRemoteRuntimeSnapshot = {
      page: {
        id: readString(page.id),
        code: readString(page.code),
        route: readString(page.route),
        title: readString(page.title),
        pageType: readString(page.page_type),
        version: Number(page.version) || 0
      },
      route: this.readRuntimeSnapshotRecord(requestedSnapshot.route),
      data: this.readRuntimeSnapshotRecord(requestedSnapshot.data),
      forms: this.readRuntimeSnapshotRecord(requestedSnapshot.forms),
      searches: this.readRuntimeSnapshotRecord(requestedSnapshot.searches),
      grids: this.readRuntimeSnapshotRecord(requestedSnapshot.grids),
      event: this.readRuntimeSnapshotRecord(requestedSnapshot.event),
      runtimeSpec: this.readRuntimeSnapshotRecord(runtimeFunction.runtime_spec)
    };
    const startedAt = Date.now();
    try {
      const execution = await executeLowCodeRemoteRuntime({
        sourceCode: readString(runtimeFunction.source_code),
        args,
        snapshot,
        limits: this.isRecord(runtimeFunction.limits) ? runtimeFunction.limits : {},
        allowedEffects: capabilities
      });
      return {
        runtimeKey: readString(runtimeFunction.runtime_key),
        functionName: readString(runtimeFunction.function_name),
        executionMode: 'remote',
        durationMs: Date.now() - startedAt,
        value: execution.value,
        effects: execution.effects,
        ...(typeof execution.resultEffect === 'number'
          ? { resultEffect: execution.resultEffect }
          : {})
      };
    } catch (error) {
      throw new BadRequestException({
        code: 'LOW_CODE_REMOTE_RUNTIME_FAILED',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private readRuntimeSnapshotRecord(value: unknown) {
    return this.isRecord(value) ? value : {};
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

    return this.prepareRuntimePage(
      page,
      authorization,
      await this.readActiveNodeActions(adminClient),
      await this.readActiveRuntimeFunctions(adminClient, String(page.id ?? ''), page.page_type)
    );
  }

  private async readActiveNodeActions(
    client: ReturnType<typeof createSupabaseClient>
  ) {
    const { data, error } = await client
      .from('lowcode_node_actions')
      .select('*')
      .eq('enabled', true)
      .order('node_type', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async readActiveRuntimeFunctions(
    client: ReturnType<typeof createSupabaseClient>,
    pageId: string,
    pageType: string | null | undefined
  ) {
    let query = client
      .from('lowcode_page_runtime')
      .select('*')
      .eq('enabled', true)
      .eq('status', 'published')
      .order('sort_order', { ascending: true });
    query = query.or(`page_id.is.null,page_id.eq.${pageId}`);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).filter((item) => {
      if (!pageType) return true;
      return item.page_type === null || item.page_type === pageType;
    });
  }

  protected prepareRuntimePage(
    page: Record<string, unknown>,
    authorization: Awaited<ReturnType<typeof getUserAuthorization>>,
    nodeActions: Array<Record<string, unknown>> = [],
    runtimeFunctions: Array<Record<string, unknown>> = []
  ) {
    const schema = page.schema && typeof page.schema === 'object' && !Array.isArray(page.schema)
      ? migrateLowCodePageSchema(structuredClone(page.schema as Record<string, unknown>))
      : {};
    const moduleName = schema && typeof schema === 'object'
      ? readString((schema as Record<string, unknown>).code).split('_')[0]
      : '';
    const runtimePage = {
      ...page,
      schema,
      node_actions: nodeActions,
      runtime_functions: runtimeFunctions
    };
    if (moduleName === 'mes') {
      const canManageMes = hasRequiredPermission(
        authorization,
        'mes.execution.manage'
      );
      this.applyMesRuntimeAccess(schema, canManageMes);
      return {
        ...runtimePage,
        schema,
        runtime_capabilities: { mes: { canManage: canManageMes } }
      };
    }

    if (moduleName !== 'planning') return runtimePage;

    const canManagePlanning = hasRequiredPermission(
      authorization,
      'planning.models.manage'
    );
    this.applyPlanningRuntimeAccess(schema, canManagePlanning);

    return {
      ...runtimePage,
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

  private async listDefaultValueProcedures(context: ServiceContext) {
    const client = await this.getDefaultValueProcedureClient(context, true);
    const { data, error } = await client.rpc('read_lowcode_default_value_procedure', {
      p_action: 'list',
      p_procedure: null,
      p_context: {}
    });
    if (error) throw new BadRequestException(error.message);
    return Array.isArray(data) ? data : [];
  }

  private async executeDefaultValueProcedure(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const procedure = readString(
      postData.procedure ?? postData.procedureName ?? postData.procedure_name
    );
    if (!procedure) throw new BadRequestException('procedure is required.');

    const client = await this.getDefaultValueProcedureClient(context, false);
    const procedureContext = {
      accountId: context.accountId,
      accountCode: context.accountCode,
      blockId: readString(postData.blockId ?? postData.block_id),
      field: readString(postData.field),
      values: this.isRecord(postData.values) ? postData.values : {}
    };
    const { data, error } = await client.rpc('read_lowcode_default_value_procedure', {
      p_action: 'execute',
      p_procedure: procedure,
      p_context: procedureContext
    });
    if (error) {
      if (error.code === '42501') throw new ForbiddenException(error.message);
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      throw new BadRequestException(error.message);
    }
    return data;
  }

  protected async getDefaultValueProcedureClient(
    context: ServiceContext,
    manage: boolean
  ) {
    if (manage) {
      return (await requireAdmin(
        context,
        ['lowcode.pages.manage', 'admin.entities.manage']
      )).client;
    }
    return (await getCurrentUser(context)).client;
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
