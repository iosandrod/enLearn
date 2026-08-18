import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createSupabaseClient } from '../../common/utils/supabase';
import { prepareLowCodePageSchema } from '../../lowcode-service/lowcode.schema';
import { AiAccessService } from '../ai-access.service';
import { AI_SERVICE_ROUTER, type AiServiceRouter } from '../ai-service-router';
import { AiRepository } from '../ai.repository';
import type {
  AiPrincipal,
  AiProposal,
  AiProposalDiffItem,
  AiProposalKind,
  AiProposalOperation,
  AiToolContext
} from '../ai.types';
import { PageProposalValidator } from './page-proposal.validator';
import { proposalContentHash } from './proposal-content-hash';

const PROPOSAL_TTL_MS = 24 * 60 * 60_000;
type SupportedPageType = 'list' | 'edit';
type BuiltinActionPreset = {
  code: string;
  label: string;
  icon: string;
  functionName: string;
  pageTypes: SupportedPageType[];
};
const BUILTIN_ACTIONS: Record<string, BuiltinActionPreset> = {
  'record.create': { code: 'create', label: '新增', icon: 'ri-add-line', functionName: 'create', pageTypes: ['list', 'edit'] },
  'record.copy': { code: 'copy', label: '复制', icon: 'ri-file-copy-line', functionName: 'copy', pageTypes: ['edit'] },
  'record.edit': { code: 'edit', label: '编辑', icon: 'ri-edit-line', functionName: 'edit', pageTypes: ['list'] },
  'record.modify': { code: 'modify', label: '修改', icon: 'ri-edit-2-line', functionName: 'modify', pageTypes: ['edit'] },
  'record.save': { code: 'save', label: '保存', icon: 'ri-save-line', functionName: 'save', pageTypes: ['edit'] },
  'record.approve': { code: 'approve', label: '审核', icon: 'ri-checkbox-circle-line', functionName: 'approve', pageTypes: ['list', 'edit'] },
  'record.unapprove': { code: 'unapprove', label: '反审', icon: 'ri-arrow-go-back-line', functionName: 'unapprove', pageTypes: ['list', 'edit'] },
  'record.close': { code: 'close', label: '关闭', icon: 'ri-close-circle-line', functionName: 'close', pageTypes: ['list', 'edit'] },
  'record.open': { code: 'open', label: '打开', icon: 'ri-folder-open-line', functionName: 'open', pageTypes: ['list', 'edit'] },
  'page.refresh': { code: 'refresh', label: '刷新', icon: 'ri-refresh-line', functionName: 'refresh', pageTypes: ['list', 'edit'] },
  'print.page': { code: 'print', label: '打印', icon: 'ri-printer-line', functionName: 'print', pageTypes: ['list'] },
  'page.exit': { code: 'exit', label: '退出', icon: 'ri-logout-box-r-line', functionName: 'exit', pageTypes: ['list', 'edit'] }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readSupportedPageType(schema: Record<string, unknown>) {
  const pageType = readString(schema.pageType);
  return pageType === 'list' || pageType === 'edit' ? pageType : undefined;
}

function assertBuiltinForPage(preset: BuiltinActionPreset, schema: Record<string, unknown>) {
  const pageType = readSupportedPageType(schema);
  if (!pageType || !preset.pageTypes.includes(pageType)) {
    throw new BadRequestException(
      `Built-in function "${preset.functionName}" is not available for page type "${pageType ?? 'custom'}".`
    );
  }
}

function assertTargetButtonGroup(schema: Record<string, unknown>, blockId?: string) {
  if (!blockId) return;
  const target = findBlock(schema, blockId);
  if (!target || (target.block.kind !== 'buttonGroup' && target.block.kind !== 'toolbar')) {
    throw new BadRequestException(`Button target block "${blockId}" is not a button group or toolbar.`);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
}

function schemaHash(schema: unknown) {
  return createHash('sha256').update(JSON.stringify(stableSort(schema))).digest('hex');
}

function builtinScript(functionName: string) {
  return [
    'async function main() {',
    '  return this.executeFunction({',
    `    name: ${JSON.stringify(functionName)},`,
    '    args: {},',
    '  });',
    '}'
  ].join('\n');
}

function findBlockContainers(schema: Record<string, unknown>) {
  const results: Array<{ blocks: unknown[]; parentBlockId?: string; tabKey?: string }> = [];
  const visit = (value: unknown, parentBlockId?: string, tabKey?: string) => {
    if (!Array.isArray(value)) return;
    results.push({ blocks: value, parentBlockId, tabKey });
    value.filter(isRecord).forEach((block) => {
      const id = readString(block.id) || parentBlockId;
      visit(block.blocks, id, tabKey);
      visit(block.overlays, id, tabKey);
      if (Array.isArray(block.tabs)) {
        block.tabs.forEach((tab) => {
          if (isRecord(tab)) visit(tab.blocks, id, readString(tab.key));
        });
      }
    });
  };
  visit(schema.blocks);
  visit(schema.overlays);
  return results;
}

function findBlock(schema: Record<string, unknown>, blockId: string) {
  for (const container of findBlockContainers(schema)) {
    const block = container.blocks.find((candidate) => isRecord(candidate) && candidate.id === blockId);
    if (isRecord(block)) return { block, container };
  }
  return undefined;
}

function findOrCreateButtonGroup(schema: Record<string, unknown>, preferredBlockId?: string) {
  if (preferredBlockId) {
    const preferred = findBlock(schema, preferredBlockId);
    if (preferred?.block.kind === 'buttonGroup' || preferred?.block.kind === 'toolbar') return preferred.block;
  }
  for (const container of findBlockContainers(schema)) {
    const existing = container.blocks.find((block) =>
      isRecord(block) && (block.kind === 'buttonGroup' || block.kind === 'toolbar'));
    if (isRecord(existing)) return existing;
  }
  if (!Array.isArray(schema.blocks)) schema.blocks = [];
  const block: Record<string, unknown> = {
    id: `ai-actions-${randomUUID().slice(0, 8)}`,
    kind: 'buttonGroup',
    title: '页面操作',
    align: 'left',
    gap: 8,
    actions: []
  };
  (schema.blocks as unknown[]).unshift(block);
  return block;
}

function resolveButtonGroupId(schema: Record<string, unknown>, preferredBlockId?: string) {
  return readString(findOrCreateButtonGroup(schema, preferredBlockId).id);
}

function requireGridColumns(schema: Record<string, unknown>, blockId: string) {
  const found = findBlock(schema, blockId);
  if (!found || found.block.kind !== 'grid') {
    throw new BadRequestException(`Grid block "${blockId}" was not found.`);
  }
  const blockSchema = isRecord(found.block.schema) ? found.block.schema : {};
  const grid = isRecord(blockSchema.grid) ? blockSchema.grid : {};
  if (!Array.isArray(grid.columns)) {
    throw new BadRequestException(`Grid block "${blockId}" has no columns.`);
  }
  return {
    block: found.block,
    blockSchema,
    grid,
    columns: grid.columns.filter(isRecord)
  };
}

function applyGridColumnAppearance(
  column: Record<string, unknown>,
  changes: Record<string, unknown>
) {
  const next: Record<string, unknown> = { ...column, ...clone(changes), field: column.field };
  if ('width' in changes && !('minWidth' in changes)) delete next.minWidth;
  if ('minWidth' in changes && !('width' in changes)) delete next.width;
  return next;
}

function saveGridColumns(
  block: Record<string, unknown>,
  blockSchema: Record<string, unknown>,
  grid: Record<string, unknown>,
  columns: Record<string, unknown>[]
) {
  block.schema = {
    ...blockSchema,
    grid: {
      ...grid,
      columns
    }
  };
}

function applyOperations(base: Record<string, unknown>, operations: AiProposalOperation[]) {
  const schema = clone(base);
  for (const operation of operations) {
    if (operation.type === 'updatePageInfo') {
      if (operation.title) schema.title = operation.title;
      if (operation.description !== undefined) schema.description = operation.description;
      continue;
    }
    if (operation.type === 'upsertDataSource') {
      const sources = isRecord(schema.dataSources) ? schema.dataSources : {};
      sources[operation.key] = clone(operation.dataSource);
      schema.dataSources = sources;
      continue;
    }
    if (operation.type === 'updateGridColumn') {
      const target = requireGridColumns(schema, operation.blockId);
      const index = target.columns.findIndex((column) => readString(column.field) === operation.field);
      if (index < 0) {
        throw new BadRequestException(
          `Column "${operation.field}" was not found in grid "${operation.blockId}".`
        );
      }
      target.columns[index] = applyGridColumnAppearance(target.columns[index], operation.changes);
      saveGridColumns(target.block, target.blockSchema, target.grid, target.columns);
      continue;
    }
    if (operation.type === 'upsertGridColumn') {
      const target = requireGridColumns(schema, operation.blockId);
      const field = readString(operation.column.field);
      const existingIndex = target.columns.findIndex((column) => readString(column.field) === field);
      const nextColumn = existingIndex >= 0
        ? applyGridColumnAppearance(target.columns[existingIndex], operation.column)
        : clone(operation.column);
      if (existingIndex >= 0) target.columns.splice(existingIndex, 1);
      if (operation.afterField) {
        const anchorIndex = target.columns.findIndex(
          (column) => readString(column.field) === operation.afterField
        );
        if (anchorIndex < 0) {
          throw new BadRequestException(
            `Anchor column "${operation.afterField}" was not found in grid "${operation.blockId}".`
          );
        }
        target.columns.splice(anchorIndex + 1, 0, nextColumn);
      } else {
        target.columns.push(nextColumn);
      }
      saveGridColumns(target.block, target.blockSchema, target.grid, target.columns);
      continue;
    }
    if (operation.type === 'upsertPageFunction') {
      const functions = Array.isArray(schema.functions) ? schema.functions.filter(isRecord) : [];
      const name = readString(operation.pageFunction.name);
      const pageFunction = clone(operation.pageFunction);
      if (operation.builtinFunction) {
        const preset = Object.values(BUILTIN_ACTIONS).find(
          (item) => item.functionName === operation.builtinFunction
        );
        if (!preset) {
          throw new BadRequestException(`Unsupported built-in page function "${operation.builtinFunction}".`);
        }
        assertBuiltinForPage(preset, schema);
        pageFunction.script = builtinScript(operation.builtinFunction);
      }
      const index = functions.findIndex((item) => item.name === name);
      if (index >= 0) functions[index] = pageFunction;
      else functions.push(pageFunction);
      schema.functions = functions;
      continue;
    }
    if (operation.type === 'updateScriptPolicy') {
      const current = isRecord(schema.scriptPolicy) ? schema.scriptPolicy : {};
      schema.scriptPolicy = {
        ...current,
        ...(operation.capabilities ? { capabilities: [...new Set(operation.capabilities)] } : {}),
        ...(operation.apiNames ? { apiNames: [...new Set(operation.apiNames)] } : {})
      };
      continue;
    }
    if (operation.type === 'upsertButtonAction') {
      const group = findOrCreateButtonGroup(schema, operation.blockId);
      const actions = Array.isArray(group.actions) ? group.actions.filter(isRecord) : [];
      const code = readString(operation.action.code);
      const index = actions.findIndex((item) => item.code === code);
      if (index >= 0) actions[index] = clone(operation.action);
      else actions.push(clone(operation.action));
      group.actions = actions;
      continue;
    }
    if (operation.type === 'bindButtonToPageFunction') {
      const target = findBlock(schema, operation.blockId);
      if (!target || (target.block.kind !== 'buttonGroup' && target.block.kind !== 'toolbar')) {
        throw new BadRequestException(`Button target block "${operation.blockId}" was not found.`);
      }
      const functions = Array.isArray(schema.functions) ? schema.functions.filter(isRecord) : [];
      if (!functions.some((pageFunction) => readString(pageFunction.name) === operation.functionName)) {
        throw new BadRequestException(`Page function "${operation.functionName}" was not found.`);
      }
      const actions = Array.isArray(target.block.actions) ? target.block.actions.filter(isRecord) : [];
      const index = actions.findIndex((action) => readString(action.code) === operation.actionCode);
      if (index < 0) {
        throw new BadRequestException(
          `Button "${operation.actionCode}" was not found in block "${operation.blockId}".`
        );
      }
      const action: Record<string, unknown> = {
        ...clone(actions[index]),
        script: builtinScript(operation.functionName)
      };
      delete action.directives;
      actions[index] = action;
      target.block.actions = actions;
      continue;
    }
    if (operation.type === 'updateBlock') {
      const found = findBlock(schema, operation.blockId);
      if (!found) throw new BadRequestException(`Block "${operation.blockId}" was not found.`);
      Object.assign(found.block, clone(operation.changes), { id: operation.blockId });
      continue;
    }
    if (operation.type === 'removeBlock') {
      const found = findBlock(schema, operation.blockId);
      if (!found) throw new BadRequestException(`Block "${operation.blockId}" was not found.`);
      const index = found.container.blocks.indexOf(found.block);
      found.container.blocks.splice(index, 1);
      continue;
    }
    if (operation.type === 'addBlock') {
      const containers = findBlockContainers(schema);
      const target = operation.parentBlockId
        ? containers.find((container) =>
            container.parentBlockId === operation.parentBlockId &&
            (!operation.tabKey || container.tabKey === operation.tabKey))
        : containers[0];
      if (!target) throw new BadRequestException('Target block container was not found.');
      const next = clone(operation.block);
      const anchor = operation.anchorBlockId
        ? target.blocks.findIndex((block) => isRecord(block) && block.id === operation.anchorBlockId)
        : -1;
      if (anchor >= 0 && operation.position === 'before') target.blocks.splice(anchor, 0, next);
      else if (anchor >= 0 && operation.position === 'after') target.blocks.splice(anchor + 1, 0, next);
      else if (operation.position === 'start') target.blocks.unshift(next);
      else target.blocks.push(next);
    }
  }
  return schema;
}

function syncVisualEditor(baseSchema: Record<string, unknown>, candidate: Record<string, unknown>, operations: AiProposalOperation[]) {
  if (!isRecord(baseSchema.visualEditor)) return candidate;
  const requiresRegeneration = operations.some((operation) =>
    operation.type === 'addBlock' ||
    operation.type === 'updateBlock' ||
    operation.type === 'removeBlock' ||
    operation.type === 'upsertDataSource' ||
    operation.type === 'updateGridColumn' ||
    operation.type === 'upsertGridColumn'
  );
  if (requiresRegeneration) {
    const regenerated = { ...candidate };
    delete regenerated.visualEditor;
    return regenerated;
  }
  const visualEditor = clone(baseSchema.visualEditor);
  const pages = isRecord(visualEditor.pages) ? visualEditor.pages : {};
  const page = isRecord(pages['/']) ? pages['/'] : undefined;
  if (!page || !Array.isArray(page.blocks)) return { ...candidate, visualEditor };

  const visualBlocks = page.blocks.filter(isRecord);
  for (const operation of operations) {
    if (operation.type === 'updatePageInfo') {
      if (operation.title) page.title = operation.title;
      continue;
    }
    if (operation.type !== 'upsertButtonAction' && operation.type !== 'bindButtonToPageFunction') continue;
    let visual = operation.blockId
      ? visualBlocks.find((block) => isRecord(block.props) && block.props.blockId === operation.blockId)
      : visualBlocks.find((block) => block.componentKey === 'lowcode-button-group');
    if (!visual) {
      const runtimeGroup: Record<string, unknown> = findOrCreateButtonGroup(candidate, operation.blockId);
      visual = {
        _vid: `vid_${readString(runtimeGroup.id) || randomUUID().slice(0, 8)}`,
        moduleName: 'businessComponents',
        componentKey: 'lowcode-button-group',
        label: '按钮组',
        adjustPosition: true,
        focus: false,
        styles: { display: 'flex', justifyContent: 'flex-start', paddingTop: '0', paddingRight: '0', paddingLeft: '0', paddingBottom: '0', tempPadding: '0' },
        layout: {},
        hasResize: false,
        props: { blockId: runtimeGroup.id, title: runtimeGroup.title ?? '页面操作', align: 'left', gap: 8, buttons: [] },
        draggable: true,
        showStyleConfig: true,
        animations: [],
        actions: [],
        events: [],
        model: {}
      };
      visualBlocks.unshift(visual);
    }
    const props = isRecord(visual.props) ? visual.props : {};
    const buttons = Array.isArray(props.buttons) ? props.buttons.filter(isRecord) : [];
    const code = operation.type === 'upsertButtonAction'
      ? readString(operation.action.code)
      : operation.actionCode;
    const row = operation.type === 'upsertButtonAction'
      ? {
          ...clone(operation.action),
          directivesJson: Array.isArray(operation.action.directives) ? clone(operation.action.directives) : []
        }
      : {
          ...(clone(buttons.find((button) => readString(button.code) === code) ?? {})),
          script: builtinScript(operation.functionName),
          directivesJson: []
        };
    const index = buttons.findIndex((button) => button.code === code);
    if (index >= 0) buttons[index] = row;
    else if (operation.type === 'upsertButtonAction') buttons.push(row);
    visual.props = { ...props, buttons };
  }
  page.blocks = visualBlocks;
  pages['/'] = page;
  visualEditor.pages = pages;
  return { ...candidate, visualEditor };
}

function buildDiff(operations: AiProposalOperation[]): AiProposalDiffItem[] {
  return operations.map((operation, index) => {
    const category: AiProposalDiffItem['category'] = operation.type === 'upsertButtonAction' ||
      operation.type === 'bindButtonToPageFunction'
      ? 'button'
      : operation.type === 'upsertPageFunction'
        ? 'function'
        : operation.type === 'upsertDataSource'
          ? 'data_source'
          : operation.type === 'updateScriptPolicy'
            ? 'security'
            : operation.type === 'updatePageInfo'
              ? 'page'
              : 'block';
    const label = operation.type === 'upsertButtonAction'
      ? `按钮：${readString(operation.action.label) || readString(operation.action.code)}`
      : operation.type === 'bindButtonToPageFunction'
        ? `按钮绑定：${operation.actionCode} -> ${operation.functionName}`
      : operation.type === 'upsertPageFunction'
        ? `页面函数：${readString(operation.pageFunction.name)}`
        : operation.type === 'updateGridColumn'
          ? `表格列：${operation.field}`
          : operation.type === 'upsertGridColumn'
            ? `表格列：${readString(operation.column.field)}`
        : operation.type === 'upsertDataSource'
          ? `数据源：${operation.key}`
          : operation.type === 'updateScriptPolicy'
            ? '脚本能力授权'
            : operation.type === 'updatePageInfo'
              ? '页面信息'
              : `区块操作：${operation.type}`;
    return {
      id: `${operation.type}-${index}`,
      category,
      label,
      after: operation,
      severity: category === 'security' ? 'warning' : 'normal'
    };
  });
}

@Injectable()
export class PageProposalService {
  constructor(
    @Inject(AI_SERVICE_ROUTER) private readonly router: AiServiceRouter,
    @Inject(AiRepository) private readonly repository: AiRepository,
    @Inject(PageProposalValidator) private readonly validator: PageProposalValidator,
    @Inject(AiAccessService) private readonly access: AiAccessService
  ) {}

  async createTablePage(context: AiToolContext, args: Record<string, unknown>) {
    this.access.assertPermission(context.principal, ['ai.page.propose', 'lowcode.pages.manage']);
    const tableName = readString(args.tableName);
    const tableOptions = await this.router.invoke(
      'lowcode',
      'listTablePageOptions',
      {},
      context.principal.context
    );
    const allowedTables = Array.isArray(tableOptions)
      ? tableOptions.filter(isRecord).map((item) =>
          readString(item.value ?? item.tableName)
        ).filter(Boolean)
      : [];
    if (!tableName || !allowedTables.includes(tableName)) {
      throw new BadRequestException('Selected table is not available to the current page manager.');
    }
    const candidate = await this.router.invoke('lowcode', 'generateTableListPageSchema', {
      tableName,
      code: readString(args.code),
      route: readString(args.route),
      title: readString(args.title),
      description: readString(args.description),
      status: 'draft'
    }, context.principal.context);
    return this.createProposal(context, 'create_page', candidate, [], readString(args.description) || '生成新的低代码页面');
  }

  async patchPage(context: AiToolContext, args: Record<string, unknown>) {
    const operations = this.validator.parseOperations(args.operations);
    if (!operations.length) throw new BadRequestException('At least one page operation is required.');
    return this.createForCurrentPage(context, 'edit_page', operations, readString(args.summary) || '修改当前页面');
  }

  async createButton(context: AiToolContext, args: Record<string, unknown>) {
    const preset = BUILTIN_ACTIONS[readString(args.builtinKey)];
    if (!preset) throw new BadRequestException('Unsupported built-in button action.');
    const page = await this.readCurrentPage(context);
    assertBuiltinForPage(preset, page.schema as Record<string, unknown>);
    const requestedBlockId = readString(args.blockId ?? context.selection?.blockId);
    assertTargetButtonGroup(page.schema as Record<string, unknown>, requestedBlockId || undefined);
    const blockId = resolveButtonGroupId(
      page.schema as Record<string, unknown>,
      requestedBlockId || undefined
    );
    const action = {
      code: readString(args.code) || preset.code,
      label: readString(args.label) || preset.label,
      type: 'button',
      prefixIcon: preset.icon,
      eventName: `buttonGroup.${readString(args.code) || preset.code}`,
      script: builtinScript(preset.functionName)
    };
    return this.createForPage(context, page, 'create_button', [{
      type: 'upsertButtonAction',
      blockId,
      action
    }], readString(args.summary) || `新增“${action.label}”按钮`);
  }

  async createPageFunction(context: AiToolContext, args: Record<string, unknown>) {
    const name = readString(args.name);
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new BadRequestException('Function name must be a valid JavaScript identifier.');
    const builtinFunction = readString(args.builtinFunction) || 'refresh';
    const preset = Object.values(BUILTIN_ACTIONS).find((item) => item.functionName === builtinFunction);
    if (!preset) throw new BadRequestException('Unsupported built-in page function.');
    const page = await this.readCurrentPage(context);
    assertBuiltinForPage(preset, page.schema as Record<string, unknown>);
    return this.createForPage(context, page, 'create_page_function', [{
      type: 'upsertPageFunction',
      pageFunction: {
        name,
        label: readString(args.label) || name,
        description: readString(args.description),
        enabled: true
      },
      builtinFunction
    }], `新增页面函数“${name}”`);
  }

  async apply(principal: AiPrincipal, proposalId: string) {
    this.access.assertPermission(principal, 'ai.page.apply');
    this.access.assertPermission(principal, 'lowcode.pages.manage');
    let proposal = await this.repository.getProposal(principal, proposalId);
    if (proposal.status !== 'awaiting_approval' && proposal.status !== 'validated') {
      throw new ConflictException(`Proposal cannot be applied from status "${proposal.status}".`);
    }
    if (new Date(proposal.expiresAt).getTime() <= Date.now()) {
      proposal = await this.repository.updateProposalStatus(principal, proposal, 'expired');
      throw new ConflictException('Proposal has expired.');
    }
    if (proposal.validationIssues.some((issue) => issue.level === 'error')) {
      throw new BadRequestException('Proposal has validation errors.');
    }

    const baseCapabilities = proposal.baseSchema && isRecord(proposal.baseSchema.scriptPolicy) &&
      Array.isArray(proposal.baseSchema.scriptPolicy.capabilities)
      ? proposal.baseSchema.scriptPolicy.capabilities.filter((item): item is string => typeof item === 'string')
      : [];
    const revalidated = this.validator.validate(
      proposal.candidateSchema,
      proposal.operations.length,
      baseCapabilities,
      proposal.baseSchema
    );
    if (revalidated.issues.some((issue) => issue.level === 'error') ||
        schemaHash(revalidated.candidate) !== schemaHash(proposal.candidateSchema)) {
      throw new BadRequestException('Proposal candidate failed server-side revalidation.');
    }
    const contentHash = proposalContentHash(proposal);

    if (this.repository.hasDatabasePersistence()) {
      // The RPC authenticates and authorizes through auth.uid(), so it must run with the
      // caller's JWT. A service-role client would bypass identity and fail closed here.
      const client = createSupabaseClient('user', principal.context);
      const { data, error } = await client.rpc('apply_ai_page_proposal', {
        p_proposal_id: proposal.id,
        p_content_hash: contentHash
      });
      if (error) {
        if (error.code === '40001' || error.message.includes('conflict')) {
          await this.repository.updateProposalStatus(principal, proposal, 'conflicted');
          throw new ConflictException(error.message);
        }
        throw new BadRequestException(error.message);
      }
      if (isRecord(data) && data.conflict === true) {
        const status = data.status === 'expired' ? 'expired' : 'conflicted';
        await this.repository.updateProposalStatus(principal, proposal, status);
        throw new ConflictException(readString(data.message) || 'Page proposal conflict.');
      }
      return {
        proposal: this.repository.rememberProposalStatus(proposal, 'applied'),
        page: data
      };
    }

    if (this.repository.databasePersistenceRequired()) {
      throw new BadRequestException('AI proposal persistence is required before page changes can be applied.');
    }

    // The memory fallback is intended for local MockProvider demos only. It still uses the
    // existing low-code service so schema validation and permissions remain authoritative.
    let page: unknown;
    if (proposal.targetPageId) {
      const current = await this.router.invoke('lowcode', 'getRuntimePage', {
        id: proposal.targetPageId
      }, principal.context) as Record<string, unknown>;
      if (Number(current.version) !== proposal.baseVersion || schemaHash(current.schema) !== proposal.baseSchemaHash) {
        await this.repository.updateProposalStatus(principal, proposal, 'conflicted');
        throw new ConflictException('Page changed after the proposal was created.');
      }
      page = await this.router.invoke('lowcode', 'saveItem', {
        resource: 'lowcode_pages',
        id: proposal.targetPageId,
        data: this.pageSaveData(proposal.candidateSchema, Number(current.version) + 1, current)
      }, principal.context);
    } else {
      page = await this.router.invoke('lowcode', 'saveItem', {
        resource: 'lowcode_pages',
        data: this.pageSaveData(proposal.candidateSchema, 1, {})
      }, principal.context);
    }
    proposal = await this.repository.updateProposalStatus(principal, proposal, 'applied');
    return { proposal, page };
  }

  async reject(principal: AiPrincipal, proposalId: string) {
    const proposal = await this.repository.getProposal(principal, proposalId);
    if (!['draft', 'validated', 'awaiting_approval'].includes(proposal.status)) {
      throw new ConflictException(`Proposal cannot be rejected from status "${proposal.status}".`);
    }
    return this.repository.updateProposalStatus(principal, proposal, 'rejected');
  }

  private async createForCurrentPage(
    context: AiToolContext,
    kind: AiProposalKind,
    operations: AiProposalOperation[],
    summary: string
  ) {
    const page = await this.readCurrentPage(context);
    return this.createForPage(context, page, kind, operations, summary);
  }

  private async readCurrentPage(context: AiToolContext) {
    this.access.assertPermission(context.principal, ['ai.page.propose', 'lowcode.pages.manage']);
    if (!context.pageRef?.id && !context.pageRef?.code && !context.pageRef?.route) {
      throw new BadRequestException('Current page reference is required.');
    }
    const page = await this.router.invoke('lowcode', 'getRuntimePage', {
      ...context.pageRef
    }, context.principal.context) as Record<string, unknown>;
    if (!isRecord(page.schema)) throw new BadRequestException('Current page has no valid schema.');
    if (context.pageRef.version && Number(page.version) !== context.pageRef.version) {
      throw new ConflictException('Current page changed before the proposal was created.');
    }
    return page;
  }

  private async createForPage(
    context: AiToolContext,
    page: Record<string, unknown>,
    kind: AiProposalKind,
    operations: AiProposalOperation[],
    summary: string
  ) {
    const schema = page.schema;
    if (!isRecord(schema)) throw new BadRequestException('Current page has no valid schema.');
    let candidate = applyOperations(schema, operations);
    candidate = syncVisualEditor(schema, candidate, operations);
    return this.createProposal(context, kind, candidate, operations, summary, page);
  }

  private async createProposal(
    context: AiToolContext,
    kind: AiProposalKind,
    candidateInput: unknown,
    operations: AiProposalOperation[],
    summary: string,
    page?: Record<string, unknown>
  ) {
    const baseSchema = page && isRecord(page.schema) ? page.schema : undefined;
    const baseCapabilities = baseSchema && isRecord(baseSchema.scriptPolicy) && Array.isArray(baseSchema.scriptPolicy.capabilities)
      ? baseSchema.scriptPolicy.capabilities.filter((item): item is string => typeof item === 'string')
      : [];
    const { candidate, issues } = this.validator.validate(
      candidateInput,
      operations.length,
      baseCapabilities,
      baseSchema
    );
    const now = new Date();
    const proposal: AiProposal = {
      id: randomUUID(),
      accountId: context.principal.context.accountId,
      createdBy: context.principal.context.userId,
      conversationId: context.conversationId,
      runId: context.runId,
      kind,
      ...(page?.id ? { targetPageId: String(page.id) } : {}),
      ...(typeof page?.version === 'number' ? { baseVersion: page.version } : {}),
      ...(baseSchema ? { baseSchemaHash: schemaHash(baseSchema), baseSchema: clone(baseSchema) } : {}),
      summary,
      operations,
      candidateSchema: candidate as unknown as Record<string, unknown>,
      validationIssues: issues,
      diff: buildDiff(operations.length ? operations : [{ type: 'updatePageInfo', description: summary }]),
      status: issues.some((issue) => issue.level === 'error') ? 'draft' : 'awaiting_approval',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString()
    };
    await this.repository.saveProposal(context.principal, proposal);
    return { proposal };
  }

  private pageSaveData(schemaInput: Record<string, unknown>, version: number, current: Record<string, unknown>) {
    const schema = prepareLowCodePageSchema(schemaInput);
    const publishedAt = schema.status === 'published'
      ? new Date().toISOString()
      : current.published_at ?? null;
    return {
      code: schema.code,
      route: schema.route,
      title: schema.title,
      description: schema.description ?? null,
      layout: schema.layout ?? 'dashboard',
      status: schema.status ?? 'draft',
      keep_alive: schema.keepAlive ?? true,
      page_type: schema.pageType ?? 'custom',
      edit_page_id: current.edit_page_id ?? null,
      view_name: current.view_name ?? null,
      table_name: current.table_name ?? this.inferPageTableName(schema),
      schema,
      version,
      published_at: publishedAt,
      __details: [{
        resource: 'lowcode_page_versions',
        mode: 'replace',
        foreignKey: 'page_id',
        parentKey: 'id',
        rows: [{ version, schema, published_at: publishedAt }]
      }]
    };
  }

  private inferPageTableName(schema: Record<string, unknown>) {
    const sources = isRecord(schema.dataSources) ? Object.values(schema.dataSources) : [];
    for (const value of sources) {
      if (!isRecord(value)) continue;
      const postData = isRecord(value.postData) ? value.postData : {};
      const tableName = readString(value.tableName ?? value.table_name ?? postData.tableName ?? postData.table_name);
      if (tableName) return tableName.replace(/^public\./i, '');
    }
    return null;
  }
}

export const pageProposalInternals = {
  applyOperations,
  syncVisualEditor,
  schemaHash,
  proposalContentHash,
  builtinScript,
  buildDiff,
  resolveButtonGroupId,
  requireGridColumns,
  applyGridColumnAppearance
};
