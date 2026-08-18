import { BadRequestException, Injectable } from '@nestjs/common';
import {
  prepareLowCodePageSchema,
  validateLowCodePageSchema,
  type LowCodePageSchema
} from '../../lowcode-service/lowcode.schema';
import type { AiProposalOperation, AiValidationIssue } from '../ai.types';

const MAX_SCHEMA_BYTES = 1024 * 1024;
const MAX_OPERATIONS = 50;
const SAFE_AI_DIRECTIVE_TYPES = new Set([
  'setDataSource',
  'updateDataSource',
  'setGridRows',
  'updateGridRows',
  'setFormValues',
  'updateFormModel',
  'setFormData',
  'updateFormData',
  'setFormField',
  'updateFormField',
  'setSearchFilters',
  'updateSearchFilters',
  'refreshDataSource',
  'refreshDataSources',
  'refreshPage',
  'navigate',
  'routePush',
  'showMessage',
  'emitEvent',
  'openBlock',
  'openModal',
  'closeBlock',
  'closeModal',
  'toggleModal',
  'openGlobalDialog',
  'openDialog',
  'openPageReferenceDialog',
  'openLowCodePageReferenceDialog',
  'openReferenceDialog'
]);
const ALLOWED_SCRIPT_CAPABILITIES = new Set([
  'action.execute',
  'api.invoke',
  'dialog.open',
  'event.emit',
  'form.patch',
  'form.replace',
  'grid.setRows',
  'pageFunction.execute',
  'message.error',
  'message.info',
  'message.success',
  'message.warning',
  'page.refresh',
  'router.push',
  'search.patch',
  'search.replace',
  'source.refresh',
  'source.refreshAll',
  'source.set'
]);
const BUILTIN_PAGE_FUNCTIONS = new Set([
  'create',
  'copy',
  'edit',
  'modify',
  'save',
  'approve',
  'unapprove',
  'close',
  'open',
  'refresh',
  'print',
  'exit'
]);
const GRID_COLUMN_KEYS = [
  'field',
  'title',
  'width',
  'minWidth',
  'align',
  'visible',
  'fixed',
  'showOverflow',
  'sortable'
];
const GRID_COLUMN_CHANGE_KEYS = GRID_COLUMN_KEYS.filter((key) => key !== 'field');

const BLOCKED_SCRIPT_PATTERNS: Array<[RegExp, string]> = [
  [/\beval\s*\(/i, 'eval is not allowed.'],
  [/\bFunction\s*\(/, 'Dynamic Function construction is not allowed.'],
  [/\b(import|export)\s*(?:\(|\{|\*)/i, 'Dynamic modules are not allowed.'],
  [/\bfetch\s*\(/i, 'Direct network access is not allowed.'],
  [/\b(XMLHttpRequest|WebSocket|EventSource)\b/i, 'Direct network clients are not allowed.'],
  [/\b(localStorage|sessionStorage|document|window|globalThis|process|require)\b/i, 'Host globals are not allowed.'],
  [/\bthis\.executeHttp\s*\(/i, 'Direct HTTP execution is not allowed for generated scripts.']
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown, path: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new BadRequestException(`${path} must be an array of non-empty strings.`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[], path: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new BadRequestException(`${path} contains unsupported fields: ${unexpected.join(', ')}.`);
  }
}

function readGridWidth(value: unknown, path: string) {
  if (!Number.isInteger(value) || (value as number) < 40 || (value as number) > 2_000) {
    throw new BadRequestException(`${path} must be an integer between 40 and 2000.`);
  }
  return value as number;
}

function readGridColumnAppearance(value: Record<string, unknown>, path: string) {
  assertAllowedKeys(value, GRID_COLUMN_CHANGE_KEYS, path);
  const changes: Record<string, unknown> = {};
  const title = value.title === undefined ? undefined : readString(value.title);
  if (title !== undefined) {
    if (!title || title.length > 200) {
      throw new BadRequestException(`${path}.title must be between 1 and 200 characters.`);
    }
    changes.title = title;
  }
  if (value.width !== undefined) changes.width = readGridWidth(value.width, `${path}.width`);
  if (value.minWidth !== undefined) changes.minWidth = readGridWidth(value.minWidth, `${path}.minWidth`);
  if (value.align !== undefined) {
    const align = readString(value.align);
    if (!['left', 'center', 'right'].includes(align)) {
      throw new BadRequestException(`${path}.align is invalid.`);
    }
    changes.align = align;
  }
  if (value.visible !== undefined) {
    if (typeof value.visible !== 'boolean') throw new BadRequestException(`${path}.visible must be boolean.`);
    changes.visible = value.visible;
  }
  if (value.fixed !== undefined) {
    const fixed = readString(value.fixed);
    if (!['left', 'right'].includes(fixed)) throw new BadRequestException(`${path}.fixed is invalid.`);
    changes.fixed = fixed;
  }
  if (value.showOverflow !== undefined) {
    if (typeof value.showOverflow !== 'boolean' && readString(value.showOverflow) !== 'tooltip') {
      throw new BadRequestException(`${path}.showOverflow must be boolean or "tooltip".`);
    }
    changes.showOverflow = value.showOverflow;
  }
  if (value.sortable !== undefined) {
    if (typeof value.sortable !== 'boolean') throw new BadRequestException(`${path}.sortable must be boolean.`);
    changes.sortable = value.sortable;
  }
  return changes;
}

function readGridColumn(value: unknown, path: string) {
  if (!isRecord(value)) throw new BadRequestException(`${path} must be an object.`);
  assertAllowedKeys(value, GRID_COLUMN_KEYS, path);
  const field = readString(value.field);
  if (!/^[A-Za-z_$][\w$]*$/.test(field)) {
    throw new BadRequestException(`${path}.field must be a valid field identifier.`);
  }
  const changes = readGridColumnAppearance(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'field')),
    path
  );
  if (typeof changes.title !== 'string') {
    throw new BadRequestException(`${path}.title is required.`);
  }
  return { field, ...changes };
}

function parseOperation(value: unknown, index: number): AiProposalOperation {
  const path = `operations.${index}`;
  if (!isRecord(value)) throw new BadRequestException(`${path} must be an object.`);
  const type = readString(value.type);

  if (type === 'addBlock') {
    assertAllowedKeys(value, ['type', 'block', 'parentBlockId', 'tabKey', 'position', 'anchorBlockId'], path);
    if (!isRecord(value.block) || !readString(value.block.id)) {
      throw new BadRequestException(`${path}.block must include a stable id.`);
    }
    const position = readString(value.position);
    if (position && !['start', 'end', 'before', 'after'].includes(position)) {
      throw new BadRequestException(`${path}.position is invalid.`);
    }
    return {
      type,
      block: value.block,
      ...(readString(value.parentBlockId) ? { parentBlockId: readString(value.parentBlockId) } : {}),
      ...(readString(value.tabKey) ? { tabKey: readString(value.tabKey) } : {}),
      ...(position ? { position: position as 'start' | 'end' | 'before' | 'after' } : {}),
      ...(readString(value.anchorBlockId) ? { anchorBlockId: readString(value.anchorBlockId) } : {})
    };
  }
  if (type === 'updateBlock') {
    assertAllowedKeys(value, ['type', 'blockId', 'changes'], path);
    const blockId = readString(value.blockId);
    if (!blockId || !isRecord(value.changes)) throw new BadRequestException(`${path} requires blockId and changes.`);
    if ('id' in value.changes || 'kind' in value.changes) {
      throw new BadRequestException(`${path}.changes cannot replace block identity or kind.`);
    }
    return { type, blockId, changes: value.changes };
  }
  if (type === 'removeBlock') {
    assertAllowedKeys(value, ['type', 'blockId'], path);
    const blockId = readString(value.blockId);
    if (!blockId) throw new BadRequestException(`${path}.blockId is required.`);
    return { type, blockId };
  }
  if (type === 'upsertDataSource') {
    assertAllowedKeys(value, ['type', 'key', 'dataSource'], path);
    const key = readString(value.key);
    if (!key || !isRecord(value.dataSource)) throw new BadRequestException(`${path} requires key and dataSource.`);
    return { type, key, dataSource: { ...value.dataSource, key } };
  }
  if (type === 'updateGridColumn') {
    assertAllowedKeys(value, ['type', 'blockId', 'field', 'changes'], path);
    const blockId = readString(value.blockId);
    const field = readString(value.field);
    if (!blockId || !/^[A-Za-z_$][\w$]*$/.test(field) || !isRecord(value.changes)) {
      throw new BadRequestException(`${path} requires blockId, field, and changes.`);
    }
    const changes = readGridColumnAppearance(value.changes, `${path}.changes`);
    if (!Object.keys(changes).length) {
      throw new BadRequestException(`${path}.changes must include a supported column property.`);
    }
    return { type, blockId, field, changes };
  }
  if (type === 'upsertGridColumn') {
    assertAllowedKeys(value, ['type', 'blockId', 'column', 'afterField'], path);
    const blockId = readString(value.blockId);
    if (!blockId) throw new BadRequestException(`${path}.blockId is required.`);
    const column = readGridColumn(value.column, `${path}.column`);
    const afterField = readString(value.afterField);
    if (afterField && !/^[A-Za-z_$][\w$]*$/.test(afterField)) {
      throw new BadRequestException(`${path}.afterField must be a valid field identifier.`);
    }
    if (afterField && afterField === column.field) {
      throw new BadRequestException(`${path}.afterField cannot match column.field.`);
    }
    return { type, blockId, column, ...(afterField ? { afterField } : {}) };
  }
  if (type === 'upsertPageFunction') {
    assertAllowedKeys(value, ['type', 'name', 'label', 'description', 'builtinFunction'], path);
    const name = readString(value.name);
    const builtinFunction = readString(value.builtinFunction);
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      throw new BadRequestException(`${path}.name must be a valid JavaScript identifier.`);
    }
    if (!BUILTIN_PAGE_FUNCTIONS.has(builtinFunction)) {
      throw new BadRequestException(`${path}.builtinFunction is unsupported.`);
    }
    const label = readString(value.label) || name;
    const description = readString(value.description);
    if (label.length > 100 || description.length > 500) {
      throw new BadRequestException(`${path} exceeds the supported text length.`);
    }
    return {
      type,
      builtinFunction,
      pageFunction: { name, label, description, enabled: true }
    };
  }
  if (type === 'bindButtonToPageFunction') {
    assertAllowedKeys(value, ['type', 'blockId', 'actionCode', 'functionName'], path);
    const blockId = readString(value.blockId);
    const actionCode = readString(value.actionCode);
    const functionName = readString(value.functionName);
    if (!blockId || !actionCode || !/^[A-Za-z_$][\w$]*$/.test(functionName)) {
      throw new BadRequestException(`${path} requires blockId, actionCode, and functionName.`);
    }
    return { type, blockId, actionCode, functionName };
  }
  if (type === 'updateScriptPolicy') {
    assertAllowedKeys(value, ['type', 'capabilities', 'apiNames'], path);
    if (value.capabilities === undefined && value.apiNames === undefined) {
      throw new BadRequestException(`${path} must change capabilities or apiNames.`);
    }
    return {
      type,
      ...(value.capabilities !== undefined
        ? { capabilities: readStringArray(value.capabilities, `${path}.capabilities`) }
        : {}),
      ...(value.apiNames !== undefined
        ? { apiNames: readStringArray(value.apiNames, `${path}.apiNames`) }
        : {})
    };
  }
  if (type === 'updatePageInfo') {
    assertAllowedKeys(value, ['type', 'title', 'description'], path);
    const title = value.title === undefined ? undefined : readString(value.title);
    const description = value.description === undefined ? undefined : readString(value.description);
    if (title === undefined && description === undefined) {
      throw new BadRequestException(`${path} must change title or description.`);
    }
    return {
      type,
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {})
    };
  }
  throw new BadRequestException(`${path}.type is not allowed for AI page edits.`);
}

function collectScripts(schema: LowCodePageSchema) {
  const scripts: Array<{ path: string; script: string }> = [];
  for (const [index, pageFunction] of (schema.functions ?? []).entries()) {
    scripts.push({ path: `functions.${index}.script`, script: pageFunction.script });
  }

  const visit = (values: unknown, path: string) => {
    if (!Array.isArray(values)) return;
    values.forEach((candidate, index) => {
      if (!isRecord(candidate)) return;
      const blockPath = `${path}.${index}`;
      const actionRows = Array.isArray(candidate.actions)
        ? candidate.actions
        : isRecord(candidate.schema) && Array.isArray(candidate.schema.actions)
          ? candidate.schema.actions
          : [];
      const visitActions = (actions: unknown[], actionPath: string) => {
        actions.forEach((action, actionIndex) => {
          if (!isRecord(action)) return;
          if (typeof action.script === 'string' && action.script.trim()) {
            scripts.push({ path: `${actionPath}.${actionIndex}.script`, script: action.script });
          }
          if (Array.isArray(action.children)) {
            visitActions(action.children, `${actionPath}.${actionIndex}.children`);
          }
        });
      };
      visitActions(actionRows, `${blockPath}.actions`);
      visit(candidate.blocks, `${blockPath}.blocks`);
      visit(candidate.overlays, `${blockPath}.overlays`);
      if (Array.isArray(candidate.tabs)) {
        candidate.tabs.forEach((tab, tabIndex) => {
          if (isRecord(tab)) visit(tab.blocks, `${blockPath}.tabs.${tabIndex}.blocks`);
        });
      }
    });
  };
  visit(schema.blocks, 'blocks');
  visit(schema.overlays, 'overlays');
  return scripts;
}

function scriptIssues(schema: LowCodePageSchema): AiValidationIssue[] {
  const issues: AiValidationIssue[] = [];
  for (const item of collectScripts(schema)) {
    if (item.script.length > 16_000) {
      issues.push({ level: 'error', path: item.path, message: 'Generated script is too large.' });
    }
    if (!/\b(?:async\s+)?function\s+main\s*\(/.test(item.script)) {
      issues.push({ level: 'error', path: item.path, message: 'Script must define function main().' });
    }
    for (const [pattern, message] of BLOCKED_SCRIPT_PATTERNS) {
      if (pattern.test(item.script)) issues.push({ level: 'error', path: item.path, message });
    }
  }
  return issues;
}

function issueKey(issue: AiValidationIssue) {
  return `${issue.level}\u0000${issue.path}\u0000${issue.message}`;
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
}

function fingerprint(value: unknown) {
  return JSON.stringify(stableSort(value));
}

type ExecutableSurface = {
  path: string;
  kind: 'data source' | 'page API' | 'runtime directive';
  value: unknown;
};

function collectDirectives(values: unknown, path: string, surfaces: ExecutableSurface[]) {
  if (!Array.isArray(values)) return;
  values.forEach((directive, index) => {
    if (!isRecord(directive) || directive.disabled === true) return;
    surfaces.push({
      path: `${path}.${index}`,
      kind: 'runtime directive',
      value: directive
    });
  });
}

function collectExecutableSurfaces(schema: LowCodePageSchema) {
  const surfaces: ExecutableSurface[] = [];
  Object.entries(schema.dataSources ?? {}).forEach(([key, source]) => {
    surfaces.push({ path: `dataSources.${key}`, kind: 'data source', value: source });
  });
  Object.entries(schema.apis ?? {}).forEach(([key, api]) => {
    surfaces.push({ path: `apis.${key}`, kind: 'page API', value: api });
  });
  (schema.eventHandlers ?? []).forEach((handler, index) => {
    if (!handler.disabled) {
      collectDirectives(handler.directives, `eventHandlers.${index}.directives`, surfaces);
    }
  });

  const visitActions = (values: unknown, path: string) => {
    if (!Array.isArray(values)) return;
    values.forEach((candidate, index) => {
      if (!isRecord(candidate)) return;
      collectDirectives(candidate.directives, `${path}.${index}.directives`, surfaces);
      visitActions(candidate.children, `${path}.${index}.children`);
    });
  };
  const visitBlocks = (values: unknown, path: string) => {
    if (!Array.isArray(values)) return;
    values.forEach((candidate, index) => {
      if (!isRecord(candidate)) return;
      const blockPath = `${path}.${index}`;
      const schemaValue = isRecord(candidate.schema) ? candidate.schema : {};
      visitActions(candidate.actions, `${blockPath}.actions`);
      visitActions(schemaValue.actions, `${blockPath}.schema.actions`);
      visitBlocks(candidate.blocks, `${blockPath}.blocks`);
      visitBlocks(candidate.overlays, `${blockPath}.overlays`);
      if (Array.isArray(candidate.tabs)) {
        candidate.tabs.forEach((tab, tabIndex) => {
          if (isRecord(tab)) visitBlocks(tab.blocks, `${blockPath}.tabs.${tabIndex}.blocks`);
        });
      }
    });
  };
  visitBlocks(schema.blocks, 'blocks');
  visitBlocks(schema.overlays, 'overlays');
  return surfaces;
}

function executableSurfaceIssues(schema: LowCodePageSchema, baseSchema?: LowCodePageSchema) {
  const issues: AiValidationIssue[] = [];
  const baseline = new Set((baseSchema ? collectExecutableSurfaces(baseSchema) : []).map((surface) =>
    `${surface.kind}\u0000${fingerprint(surface.value)}`
  ));
  for (const surface of collectExecutableSurfaces(schema)) {
    if (baseline.has(`${surface.kind}\u0000${fingerprint(surface.value)}`)) continue;
    if (surface.kind === 'runtime directive' && isRecord(surface.value)) {
      const type = readString(surface.value.type);
      if (SAFE_AI_DIRECTIVE_TYPES.has(type)) continue;
      issues.push({
        level: 'error',
        path: `${surface.path}.type`,
        message: type === 'invokeService'
          ? 'AI proposals cannot add direct service invocation directives.'
          : `AI proposals cannot add runtime directive "${type || 'unknown'}".`
      });
      continue;
    }
    issues.push({
      level: 'error',
      path: surface.path,
      message: `AI proposals cannot add or modify a ${surface.kind}.`
    });
  }
  return issues;
}

function schemaIssues(schema: LowCodePageSchema) {
  return validateLowCodePageSchema(schema).map((issue) => ({
    level: issue.level,
    path: issue.path,
    message: issue.message
  } as AiValidationIssue));
}

function aiSafetyIssues(schema: LowCodePageSchema, baseCapabilities: string[]) {
  const issues: AiValidationIssue[] = [];
  const capabilities = schema.scriptPolicy?.capabilities ?? [];
  for (const capability of capabilities) {
    if (!ALLOWED_SCRIPT_CAPABILITIES.has(capability)) {
      issues.push({ level: 'error', path: 'scriptPolicy.capabilities', message: `Unsupported capability: ${capability}` });
    }
  }
  const addedCapabilities = capabilities.filter((capability) => !baseCapabilities.includes(capability));
  if (addedCapabilities.length) {
    issues.push({
      level: 'error',
      path: 'scriptPolicy.capabilities',
      message: `Proposal cannot add script capabilities: ${addedCapabilities.join(', ')}.`
    });
  }
  issues.push(...scriptIssues(schema));
  return issues;
}

@Injectable()
export class PageProposalValidator {
  parseOperations(value: unknown) {
    if (!Array.isArray(value)) throw new BadRequestException('operations must be an array.');
    if (value.length > MAX_OPERATIONS) {
      throw new BadRequestException(`Proposal cannot exceed ${MAX_OPERATIONS} operations.`);
    }
    return value.map(parseOperation);
  }

  validate(
    candidate: unknown,
    operationCount = 0,
    baseCapabilities: string[] = [],
    baseSchema?: unknown
  ) {
    const prepared = prepareLowCodePageSchema(candidate);
    const issues = schemaIssues(prepared);
    if (operationCount > MAX_OPERATIONS) {
      issues.push({ level: 'error', path: 'operations', message: `Proposal cannot exceed ${MAX_OPERATIONS} operations.` });
    }
    if (Buffer.byteLength(JSON.stringify(prepared), 'utf8') > MAX_SCHEMA_BYTES) {
      issues.push({ level: 'error', path: 'candidateSchema', message: 'Candidate schema exceeds the 1 MB limit.' });
    }
    const safetyIssues = aiSafetyIssues(prepared, baseCapabilities);
    if (baseSchema === undefined) {
      issues.push(...safetyIssues);
      issues.push(...executableSurfaceIssues(prepared));
    } else {
      const preparedBase = prepareLowCodePageSchema(baseSchema);
      const baseline = new Set(aiSafetyIssues(preparedBase, baseCapabilities).map(issueKey));
      issues.push(...safetyIssues.filter((issue) => !baseline.has(issueKey(issue))));
      issues.push(...executableSurfaceIssues(prepared, preparedBase));
    }
    return { candidate: prepared, issues };
  }
}

export const pageProposalValidatorInternals = {
  parseOperation,
  readGridColumn,
  readGridColumnAppearance,
  collectScripts,
  scriptIssues,
  aiSafetyIssues,
  collectExecutableSurfaces,
  executableSurfaceIssues,
  SAFE_AI_DIRECTIVE_TYPES,
  ALLOWED_SCRIPT_CAPABILITIES
};
