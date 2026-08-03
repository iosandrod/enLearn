import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { withPostgresClient } from '../common/utils/database';
import { requireAdmin } from '../common/utils/supabase';
import {
  asRows,
  normalizeGeneratedStatus,
  readString
} from './lowcode.helpers';
import { lowCodeResources } from './lowcode.resources';
import type { LowCodePageRow } from './lowcode.types';
import {
  buildTableListPageSchemaFromDatabase,
  listDatabaseTableOptions
} from './table-page-generator';

@Injectable()
export class LowCodeService extends BaseService {
  protected override resources(): ResourceConfigMap {
    return lowCodeResources;
  }

  protected override hooks(): ServiceHooks {
    return {
      lowcode_pages: {
        beforeCreate: [this.normalizePageType],
        beforeUpdate: [this.normalizePageType]
      }
    };
  }

  private normalizePageType = (ctx: HookContext) => {
    const schema = ctx.data.schema;
    const schemaPageType = schema && typeof schema === 'object' && !Array.isArray(schema)
      ? (schema as Record<string, unknown>).pageType
      : undefined;
    const candidate = ctx.data.page_type ?? schemaPageType;

    if (candidate === undefined && ctx.action === 'update') return;

    if (
      candidate !== undefined &&
      candidate !== 'list' &&
      candidate !== 'edit' &&
      candidate !== 'detail' &&
      candidate !== 'custom'
    ) {
      throw new BadRequestException('page_type must be list, edit, detail, or custom.');
    }

    ctx.data.page_type = candidate ?? 'custom';
  };

  protected override async executeAction(method: string, postData: Record<string, unknown>, context: ServiceContext) {
    switch (method) {
      case 'listTablePageOptions':
        return this.listTablePageOptions(context);
      case 'generateTableListPageSchema':
        return this.generateTableListPageSchema(postData, context);
      case 'saveGeneratedTableListPage':
        return this.saveGeneratedTableListPage(postData, context);
      default:
        throw new BadRequestException(`Unsupported lowcode method: ${method}`);
    }
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
