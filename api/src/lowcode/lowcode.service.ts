import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService, type ResourceConfigMap } from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { withPostgresClient } from '../common/utils/database';
import { requireAdmin } from '../common/utils/supabase';
import { isRecord, type LowCodePageSchema } from './lowcode.schema';
import {
  asRows,
  normalizeActionKey,
  normalizeGeneratedStatus,
  normalizeOpenType,
  normalizePageRow,
  normalizeSchema,
  readMetadata,
  readString
} from './lowcode.helpers';
import { lowCodeResources } from './lowcode.resources';
import type {
  LowCodePageRelation,
  LowCodePageRelationInput,
  LowCodePageRelationPageRow,
  LowCodePageRelations,
  LowCodePageRow
} from './lowcode.types';
import {
  buildTableListPageSchemaFromDatabase,
  listDatabaseTableOptions
} from './table-page-generator';

@Injectable()
export class LowCodeService extends BaseService {
  protected override resources(): ResourceConfigMap {
    return lowCodeResources;
  }

  protected override async executeAction(method: string, postData: Record<string, unknown>, context: ServiceContext) {
    switch (method) {
      case 'listTablePageOptions':
        return this.listTablePageOptions(context);
      case 'generateTableListPageSchema':
        return this.generateTableListPageSchema(postData, context);
      case 'saveGeneratedTableListPage':
        return this.saveGeneratedTableListPage(postData, context);
      case 'savePage':
        return this.savePage(postData, context);
      default:
        throw new BadRequestException(`Unsupported lowcode method: ${method}`);
    }
  }

  private async findRelationPageByCode(
    context: ServiceContext,
    code: string,
    role: 'source' | 'target'
  ) {
    const [data] = asRows(await this.listItems({
      tableName: 'lowcode_pages',
      select: 'id, code, route, title, status',
      filters: { code },
      clientMode: 'admin',
      limit: 1
    }, context));

    if (!data) {
      throw new BadRequestException(`${role} page "${code}" does not exist.`);
    }

    return data as LowCodePageRelationPageRow;
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

  private async upsertPageRelation(context: ServiceContext, input: LowCodePageRelationInput) {
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
      this.findRelationPageByCode(context, sourcePageCode, 'source'),
      this.findRelationPageByCode(context, targetPageCode, 'target')
    ]);

    const relationPayload = {
      source_page_id: sourcePage.id,
      action_key: actionKey,
      target_page_id: targetPage.id,
      open_type: normalizeOpenType(input.openType),
      metadata: input.metadata ?? {}
    };

    const updated = asRows(await this.updateItem({
      resource: 'pageRelations',
      filters: { source_page_id: sourcePage.id, action_key: actionKey },
      data: relationPayload
    }, context));

    if (!updated.length) {
      await this.createItem({ resource: 'pageRelations', data: relationPayload }, context);
    }

    return {
      sourcePageId: sourcePage.id,
      sourcePageCode: sourcePage.code,
      sourcePageRoute: sourcePage.route,
      sourcePageTitle: sourcePage.title,
      actionKey,
      targetPageId: targetPage.id,
      targetPageCode: targetPage.code,
      targetPageRoute: targetPage.route,
      targetPageTitle: targetPage.title,
      openType: normalizeOpenType(input.openType),
      metadata: input.metadata ?? {}
    };
  }

  private async syncPageRelations(
    context: ServiceContext,
    savedPage: LowCodePageRow,
    postData: Record<string, unknown>
  ) {
    const relationInputs = this.collectRelationInputs(postData, savedPage);
    const syncedRelations: LowCodePageRelation[] = [];

    for (const input of relationInputs) {
      syncedRelations.push(await this.upsertPageRelation(context, input));
    }

    const incomingEditRelations = syncedRelations.filter(
      (relation) => relation.targetPageId === savedPage.id && relation.actionKey === 'edit'
    );

    for (const relation of incomingEditRelations) {
      await this.deleteItem({
        resource: 'pageRelations',
        filters: {
          target_page_id: savedPage.id,
          action_key: relation.actionKey,
          source_page_id: { op: 'ne', value: relation.sourcePageId }
        }
      }, context);
    }

    return {
      outgoing: syncedRelations.filter((relation) => relation.sourcePageId === savedPage.id),
      incoming: syncedRelations.filter((relation) => relation.targetPageId === savedPage.id)
    };
  }

  private async assertEditPageHasListRelation(
    context: ServiceContext,
    savedPage: LowCodePageRow,
    relations: LowCodePageRelations
  ) {
    if (savedPage.schema.pageType !== 'edit') return;
    if (relations.incoming.some(
      (relation) => relation.actionKey === 'edit' && relation.sourcePageCode
    )) return;

    const existing = asRows(await this.listItems({
      tableName: 'lowcode_page_relations',
      select: 'id',
      filters: { target_page_id: savedPage.id, action_key: 'edit' },
      clientMode: 'admin',
      limit: 1
    }, context));
    if (existing.length) return;

    throw new BadRequestException(
      'Edit page must be linked to a list page. Pass parentListPageCode when saving the page.'
    );
  }

  private async savePage(postData: Record<string, unknown>, context: ServiceContext) {
    await requireAdmin(context, 'lowcode.pages.manage');
    const schema = normalizeSchema(postData.schema ?? postData, true);
    const existingCode = readString(postData.code, schema.code);

    if (!existingCode) {
      throw new BadRequestException('code is required.');
    }

    const [existingPage] = asRows(await this.listItems({
      tableName: 'lowcode_pages',
      filters: { code: existingCode },
      clientMode: 'admin',
      limit: 1
    }, context)) as LowCodePageRow[];
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
      published_at: schema.status === 'published' ? now : existingPage?.published_at ?? null
    };

    const savedPage = await (existingPage
      ? this.updateItem({ resource: 'pages', id: existingPage.id, data: pagePayload }, context)
      : this.createItem({ resource: 'pages', data: pagePayload }, context)) as LowCodePageRow;

    await this.createItem({
      resource: 'pageVersions',
      data: {
        page_id: savedPage.id,
        version: nextVersion,
        schema: schema as unknown as Record<string, unknown>,
        published_at: schema.status === 'published' ? now : null
      }
    }, context);

    const relations = await this.syncPageRelations(context, savedPage, postData);
    await this.assertEditPageHasListRelation(context, savedPage, relations);

    return normalizePageRow(savedPage, relations);
  }

}
