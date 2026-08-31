import type { LowCodeHostRuntime } from '../core/host';
import { normalizeLowCodeDirectives } from '../lowcode/event-system';
import type {
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageOverlayBlock,
  LowCodePageRecord,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
} from '../types/lowcode';
import {
  executeLowCodeRuntimeDirective,
  type LowCodeRuntimeDirectiveContext,
} from './directives';
import {
  openGlobalDialog as openLowCodeGlobalDialog,
  type GlobalDialogConfig,
} from './global-dialog';
import {
  openLowCodePageReferenceDialog,
  type LowCodePageReferenceDialogConfig,
} from './page-reference-dialog';
import {
  invokeDesktopMesCommand,
  isDesktopMesCommand,
  prepareDesktopMesCommandRequest,
} from './mes-command';
import type { LowCodePageRuntimeContext } from './page-runtime';
import type { LowCodePageRendererProps } from './renderer-types';
import { isRecord, readString } from './renderer-value-utils';

type ValueRef<T> = { value: T };
type RuntimeExpressionScope = {
  row?: Record<string, unknown>;
  event?: LowCodeRuntimeEvent;
  value?: unknown;
  values?: Record<string, unknown>;
};

export type RuntimeDirectiveExecutionContext = {
  mesCommandStarted: boolean;
  mesCommandCompleted: boolean;
  mesCommandRefreshCompleted: boolean;
  mesCommandRefreshFailed: boolean;
};

export type RuntimeDirectiveControllerDependencies = {
  props: LowCodePageRendererProps;
  host: LowCodeHostRuntime;
  runtime: LowCodePageRuntimeContext;
  resolvedData: ValueRef<Record<string, unknown>>;
  message: ValueRef<string>;
  messageClass: ValueRef<string>;
  resolveRuntimeValue(value: unknown, scope?: RuntimeExpressionScope | Record<string, unknown>): unknown;
  getDataSource(key?: string): LowCodePageDataSource | undefined;
  findRuntimeBlock(blockId: string): LowCodePageBlock | undefined;
  isOverlayBlock(block: LowCodePageBlock): block is LowCodePageOverlayBlock;
  syncPageGridStates(schema?: LowCodePageRecord['schema']): void;
  refreshDataSources(
    sourceKeys?: string[],
    options?: { ordered?: boolean; strict?: boolean },
  ): Promise<string[]>;
  loadPageData(page: LowCodePageRecord): Promise<string[]>;
  resolveDataSourceRequest(
    key: string,
    source: LowCodePageDataSource,
    postData?: Record<string, unknown>,
    mergeSearchFilters?: boolean,
  ): { serviceName: string; serviceMethod: string; postData: Record<string, unknown> };
  normalizeLegacyAdminListRequest(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
  ): { serviceName: string; serviceMethod: string; postData: Record<string, unknown> };
  publishRuntimeEvent(event: LowCodeRuntimeEvent): Promise<void>;
};

/** Resolves and applies declarative runtime directives for published page events. */
export class RuntimeDirectiveController {
  readonly execute: (
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent,
    context: RuntimeDirectiveExecutionContext,
  ) => Promise<void>;

  constructor(dependencies: RuntimeDirectiveControllerDependencies) {
    const {
      props,
      host,
      runtime,
      resolvedData,
      message,
      messageClass,
      resolveRuntimeValue,
      getDataSource,
      findRuntimeBlock,
      isOverlayBlock,
      syncPageGridStates,
      refreshDataSources,
      loadPageData,
      resolveDataSourceRequest,
      normalizeLegacyAdminListRequest,
      publishRuntimeEvent,
    } = dependencies;
    function eventRow(event: LowCodeRuntimeEvent) {
      return isRecord(event.payload?.row) ? event.payload.row : {};
    }

    function directiveScope(event: LowCodeRuntimeEvent): RuntimeExpressionScope {
      return {
        event,
        row: eventRow(event),
        value: event.payload?.value,
        values: isRecord(event.payload?.values) ? event.payload.values : {},
      };
    }

    function resolveDirectiveString(value: unknown, event: LowCodeRuntimeEvent, fallback = '') {
      const resolved = resolveRuntimeValue(value, directiveScope(event));
      if (typeof resolved === 'string') return resolved.trim() || fallback;
      if (typeof resolved === 'number' || typeof resolved === 'boolean') return String(resolved);
      return fallback;
    }

    function resolveDirectiveRecord(value: unknown, event: LowCodeRuntimeEvent) {
      const resolved = resolveRuntimeValue(value, directiveScope(event));
      return isRecord(resolved) ? resolved : {};
    }

    function isLowCodePageRecordLike(value: unknown): value is LowCodePageRecord {
      return isRecord(value) && isRecord(value.schema) && typeof value.code === 'string';
    }

    function resolvePageReferenceConfig(value: unknown, event: LowCodeRuntimeEvent) {
      const resolved = resolveRuntimeValue(value, directiveScope(event));

      if (isRecord(resolved) && isRecord(value) && isLowCodePageRecordLike(value.page)) {
        return {
          ...resolved,
          page: value.page,
        };
      }

      return resolved;
    }

    function resolveDirectiveData(directive: LowCodeRuntimeDirective, event: LowCodeRuntimeEvent) {
      const rawValue =
        typeof directive.value !== 'undefined'
          ? directive.value
          : typeof directive.values !== 'undefined'
            ? directive.values
            : typeof directive.rows !== 'undefined'
              ? directive.rows
              : typeof directive.row !== 'undefined'
                ? directive.row
                : event.payload?.row ?? event.payload?.values ?? event.payload?.value;

      return resolveRuntimeValue(rawValue, directiveScope(event));
    }

    function resolveDirectiveSourceKeys(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      if (Array.isArray(directive.sourceKeys)) {
        return directive.sourceKeys
          .map((key) => resolveDirectiveString(key, event))
          .filter(Boolean);
      }

      const sourceKey = resolveDirectiveString(directive.sourceKey, event);
      return sourceKey ? [sourceKey] : [];
    }

    function normalizeRows(value: unknown) {
      if (Array.isArray(value)) return value.filter(isRecord);
      return isRecord(value) ? [value] : [];
    }

    function resolveRowKey(directive: LowCodeRuntimeDirective, event: LowCodeRuntimeEvent) {
      return resolveDirectiveString(directive.rowKey, event, 'id');
    }

    function isTruthyRuntimeValue(value: unknown) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return Boolean(normalized) && !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
      }

      return Boolean(value);
    }

    function shouldExecuteDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      if (directive.disabled) return false;
      if (typeof directive.when === 'undefined') return true;

      return isTruthyRuntimeValue(resolveRuntimeValue(directive.when, directiveScope(event)));
    }

    function mergeDataSourceValue(
      currentValue: unknown,
      nextValue: unknown,
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const mode = directive.mode ?? 'replace';

      if (mode === 'merge') {
        return isRecord(currentValue) && isRecord(nextValue)
          ? { ...currentValue, ...nextValue }
          : nextValue;
      }

      if (mode === 'append' || mode === 'prepend') {
        const currentRows = Array.isArray(currentValue) ? currentValue : [];
        const nextRows = normalizeRows(nextValue);
        return mode === 'append'
          ? [...currentRows, ...nextRows]
          : [...nextRows, ...currentRows];
      }

      if (mode === 'patch') {
        if (isRecord(currentValue) && isRecord(nextValue)) {
          return { ...currentValue, ...nextValue };
        }

        const rowKey = resolveRowKey(directive, event);
        const rows = Array.isArray(currentValue) ? [...currentValue] : [];
        normalizeRows(nextValue).forEach((nextRow) => {
          const index = rows.findIndex((row) => isRecord(row) && row[rowKey] === nextRow[rowKey]);
          if (index >= 0 && isRecord(rows[index])) {
            rows[index] = { ...rows[index], ...nextRow };
          } else {
            rows.push(nextRow);
          }
        });
        return rows;
      }

      if (mode === 'remove') {
        const rowKey = resolveRowKey(directive, event);
        const rows = Array.isArray(currentValue) ? currentValue : [];
        const removeKeys = new Set(normalizeRows(nextValue).map((row) => row[rowKey]));
        return rows.filter((row) => !isRecord(row) || !removeKeys.has(row[rowKey]));
      }

      return nextValue;
    }

    function applyDataSourceDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const [sourceKey] = resolveDirectiveSourceKeys(directive, event);
      if (!sourceKey) return;
      runtime.setSource(sourceKey, mergeDataSourceValue(
        resolvedData.value[sourceKey],
        resolveDirectiveData(directive, event),
        directive,
        event
      ));
      syncPageGridStates();
    }

    function applyGridRowsDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
      if (!blockId) return;

      const target = findRuntimeBlock(blockId);
      if (!target || target.kind !== 'grid') return;

      const nextValue = resolveDirectiveData(directive, event);

      if (target.sourceKey) {
        runtime.setSource(target.sourceKey, mergeDataSourceValue(
          resolvedData.value[target.sourceKey],
          nextValue,
          directive,
          event
        ));
        syncPageGridStates();
        return;
      }

      target.rows = mergeDataSourceValue(
        target.rows ?? [],
        nextValue,
        directive,
        event
      ) as Record<string, unknown>[];
      syncPageGridStates();
    }

    function applyFormValuesDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
      if (!blockId) return;

      const nextValues = resolveDirectiveRecord(
        directive.values ?? directive.value ?? event.payload?.values ?? event.payload?.row,
        event
      );

      if (directive.mode === 'replace') {
        runtime.replaceForm(blockId, nextValues);
        return;
      }

      runtime.patchForm(blockId, nextValues);
    }

    function applyFormFieldDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
      const field = resolveDirectiveString(directive.field, event);
      if (!blockId || !field) return;

      runtime.patchForm(blockId, {
        [field]: resolveRuntimeValue(directive.value, directiveScope(event)),
      });
    }

    async function applySearchFiltersDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const [sourceKey] = resolveDirectiveSourceKeys(directive, event);
      if (!sourceKey) return;

      const values = resolveDirectiveRecord(
        directive.values ?? directive.value ?? event.payload?.values,
        event
      );
      if (directive.mode === 'replace') runtime.replaceSearch(sourceKey, values);
      else runtime.patchSearch(sourceKey, values);

      await refreshDataSources([sourceKey]);
    }

    function setRuntimeMessage(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const nextMessage = resolveDirectiveString(directive.message ?? directive.value, event);
      if (!nextMessage) return;

      message.value = nextMessage;
      messageClass.value = directive.status === 'error' ? 'lc-error' : 'lc-help';
    }

    async function invokeServiceDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent,
      executionContext: RuntimeDirectiveExecutionContext,
    ) {
    }

    function resolveDialogFollowUpDirectives(
      directive: LowCodeRuntimeDirective,
      action: string
    ) {
      const actionKey = `${action}Directives`;
      const actionDirectives = directive[actionKey];

      return normalizeLowCodeDirectives(
        actionDirectives ??
        (action === 'confirm'
          ? directive.confirmDirectives
          : action === 'cancel'
            ? directive.cancelDirectives
            : directive.closeDirectives)
      );
    }

    async function openGlobalDialogDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const rawConfig = resolveRuntimeValue(
        directive.config ?? directive.value ?? {},
        directiveScope(event)
      );
      if (!isRecord(rawConfig)) return;

      const config = rawConfig as GlobalDialogConfig;
      const model = resolveDirectiveRecord(
        directive.model ?? config.model ?? config.form?.model ?? {},
        event
      );
      const createFollowUpEvent = (
        action: string,
        values: Record<string, unknown>,
        payload?: unknown,
      ): LowCodeRuntimeEvent => ({
        name: resolveDirectiveString(
          directive.resultEvent ?? directive.event,
          event,
          `dialog.${action}`
        ),
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: {
          action,
          values,
          payload,
          directives: resolveDialogFollowUpDirectives(directive, action),
        },
      });
      const result = await openLowCodeGlobalDialog({
        ...config,
        model,
        form: config.form
          ? {
            ...config.form,
            model,
          }
          : config.form,
        onConfirm: async (context) => {
          const configuredResult = await config.onConfirm?.(context);
          if (
            configuredResult === false ||
            (isRecord(configuredResult) && 'close' in configuredResult && configuredResult.close === false)
          ) {
            return configuredResult;
          }

          await publishRuntimeEvent(createFollowUpEvent(
            'confirm',
            context.model,
            isRecord(configuredResult) ? configuredResult.payload : undefined,
          ));
          return configuredResult;
        },
      });
      if (result.action === 'confirm') return;
      const followUpDirectives = resolveDialogFollowUpDirectives(directive, result.action);
      const resultEvent = resolveDirectiveString(
        directive.resultEvent ?? directive.event,
        event,
        `dialog.${result.action}`
      );

      if (!resultEvent && !followUpDirectives.length) return;

      await publishRuntimeEvent({
        name: resultEvent,
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: {
          action: result.action,
          values: result.values,
          payload: result.payload,
          directives: followUpDirectives,
        },
      });
    }

    function getOptionalServiceApi() {
      if (props.serviceApi) return props.serviceApi;

      try {
        return host.getServiceApi();
      } catch {
        return undefined;
      }
    }

    function getOptionalRouter() {
      return props.router ?? host.getRouter();
    }

    function getCurrentRoute() {
      return props.route ?? host.getRoute();
    }

    async function openPageReferenceDialogDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent
    ) {
      const rawConfig = resolvePageReferenceConfig(
        directive.config ?? directive.value ?? {},
        event
      );
      if (!isRecord(rawConfig)) return;

      const result = await openLowCodePageReferenceDialog({
        ...(rawConfig as LowCodePageReferenceDialogConfig),
        serviceApi:
          (rawConfig as LowCodePageReferenceDialogConfig).serviceApi ?? getOptionalServiceApi(),
        router: (rawConfig as LowCodePageReferenceDialogConfig).router ?? getOptionalRouter(),
        route: (rawConfig as LowCodePageReferenceDialogConfig).route ?? getCurrentRoute(),
        locale: (rawConfig as LowCodePageReferenceDialogConfig).locale ?? props.locale,
        messages: (rawConfig as LowCodePageReferenceDialogConfig).messages ?? props.messages,
        theme: (rawConfig as LowCodePageReferenceDialogConfig).theme ?? props.theme,
      });
      const resultPayload: Record<string, unknown> = isRecord(result.payload)
        ? result.payload
        : {};
      const row = isRecord(resultPayload.row) ? resultPayload.row : undefined;
      const followUpDirectives = resolveDialogFollowUpDirectives(directive, result.action);
      const resultEvent = resolveDirectiveString(
        directive.resultEvent ?? directive.event,
        event,
        `reference.${result.action}`
      );

      if (!resultEvent && !followUpDirectives.length) return;

      await publishRuntimeEvent({
        name: resultEvent,
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: {
          action: result.action,
          values: result.values,
          payload: result.payload,
          ...(row ? { row } : {}),
          value: resultPayload.value,
          label: resultPayload.label,
          page: resultPayload.page,
          referenceBlockId: resultPayload.blockId,
          referenceBlockKind: resultPayload.blockKind,
          directives: followUpDirectives,
        },
      });
    }

    function setBlockOpen(blockId: string, open: boolean) {
      const target = findRuntimeBlock(blockId);
      if (target && 'open' in target) {
        target.open = open;
        if (!open && isOverlayBlock(target)) {
          closeNestedOverlays(target);
        }
      }
    }

    function closeNestedOverlays(block: LowCodePageOverlayBlock) {
      (block.overlays ?? []).forEach((overlay) => {
        overlay.open = false;
        closeNestedOverlays(overlay);
      });
    }

    function toggleBlockOpen(blockId: string) {
      const target = findRuntimeBlock(blockId);
      if (target && 'open' in target) {
        setBlockOpen(blockId, target.open === false);
      }
    }

    async function executeRuntimeDirective(
      directive: LowCodeRuntimeDirective,
      event: LowCodeRuntimeEvent,
      executionContext: RuntimeDirectiveExecutionContext,
    ) {
      const refreshAfterMesCommand = executionContext.mesCommandCompleted
        && !executionContext.mesCommandRefreshCompleted
        && !executionContext.mesCommandRefreshFailed;
      const directiveContext: LowCodeRuntimeDirectiveContext = {
        runtimeFunctions: runtime.runtimeFunctions ?? [],
        shouldExecuteDirective,
        resolveDirectiveString,
        resolveDirectiveRecord,
        resolveDirectiveSourceKeys,
        applyDataSourceDirective,
        applyGridRowsDirective,
        applyFormValuesDirective,
        applyFormFieldDirective,
        applySearchFiltersDirective,
        refreshDataSources: async (sourceKeys) => {
          try {
            const errors = await refreshDataSources(sourceKeys, {
              ordered: refreshAfterMesCommand,
              strict: refreshAfterMesCommand,
            });
            if (refreshAfterMesCommand) {
              executionContext.mesCommandRefreshCompleted = true;
            }
            return errors;
          } catch (error) {
            if (refreshAfterMesCommand) executionContext.mesCommandRefreshFailed = true;
            throw error;
          }
        },
        refreshPage: () => loadPageData(props.page).then(() => undefined),
        invokeServiceDirective: (nextDirective, nextEvent) =>
          invokeServiceDirective(nextDirective, nextEvent, executionContext),
        navigate: (route) => (route ? host.getRouter().push(route) : undefined),
        setRuntimeMessage,
        emitRuntimeEvent: publishRuntimeEvent,
        setBlockOpen,
        toggleBlockOpen,
        openGlobalDialog: openGlobalDialogDirective,
        openPageReferenceDialog: openPageReferenceDialogDirective,
      };

      await executeLowCodeRuntimeDirective(directive, event, directiveContext);
    }

    this.execute = executeRuntimeDirective;
  }
}
