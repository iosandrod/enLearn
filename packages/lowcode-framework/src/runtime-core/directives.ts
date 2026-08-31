import type {
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
  LowCodeRuntimeFunctionDefinition,
} from '../types/lowcode';

export type LowCodeRuntimeDirectiveContext = {
  runtimeFunctions: LowCodeRuntimeFunctionDefinition[];
  shouldExecuteDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): boolean;
  resolveDirectiveString(
    value: unknown,
    event: LowCodeRuntimeEvent,
    fallback?: string
  ): string;
  resolveDirectiveRecord(
    value: unknown,
    event: LowCodeRuntimeEvent
  ): Record<string, unknown>;
  resolveDirectiveSourceKeys(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): string[];
  applyDataSourceDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): void;
  applyGridRowsDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): void;
  applyFormValuesDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): void;
  applyFormFieldDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): void;
  applySearchFiltersDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): Promise<void> | void;
  refreshDataSources(sourceKeys?: string[]): Promise<string[]> | string[];
  refreshPage(): Promise<void> | void;
  invokeServiceDirective(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): Promise<void> | void;
  navigate(route: string): Promise<unknown> | unknown;
  setRuntimeMessage(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): void;
  emitRuntimeEvent(event: LowCodeRuntimeEvent): Promise<void> | void;
  setBlockOpen(blockId: string, open: boolean): void;
  toggleBlockOpen(blockId: string): void;
  openGlobalDialog?(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): Promise<void> | void;
  openPageReferenceDialog?(
    directive: LowCodeRuntimeDirective,
    event: LowCodeRuntimeEvent
  ): Promise<void> | void;
};

export type LowCodeRuntimeDirectiveHandler = (
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent,
  context: LowCodeRuntimeDirectiveContext
) => Promise<void> | void;

const directiveRegistry = new Map<string, LowCodeRuntimeDirectiveHandler>();
let defaultDirectivesRegistered = false;

export function registerLowCodeRuntimeDirective(
  type: string,
  handler: LowCodeRuntimeDirectiveHandler
) {
  directiveRegistry.set(type, handler);
}

export function registerLowCodeRuntimeDirectiveAliases(
  types: string[],
  handler: LowCodeRuntimeDirectiveHandler
) {
  types.forEach((type) => registerLowCodeRuntimeDirective(type, handler));
}

export function getLowCodeRuntimeDirective(type?: string) {
  return type ? directiveRegistry.get(type) : undefined;
}

export function getLowCodeRuntimeDirectiveTypes() {
  return [...directiveRegistry.keys()];
}

export async function executeLowCodeRuntimeDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent,
  context: LowCodeRuntimeDirectiveContext
) {
  if (!context.shouldExecuteDirective(directive, event)) return;

  const directiveType = directive.type.trim();
  const definition = context.runtimeFunctions
    .filter((item) =>
      item.function_type === 'directive' &&
      item.function_name === directiveType &&
      item.enabled !== false,
    )
    .sort((left, right) => Number(right.page_id !== null) - Number(left.page_id !== null))[0];
  const configuredHandler = definition && typeof definition.runtime_spec.handler === 'string'
    ? definition.runtime_spec.handler.trim()
    : '';
  const handler = getLowCodeRuntimeDirective(configuredHandler || directiveType);
  if (!handler) return;

  await handler(directive, event, context);
}

export function registerDefaultLowCodeRuntimeDirectives() {
  if (defaultDirectivesRegistered) return;
  defaultDirectivesRegistered = true;

  const apply = (
    handler: string,
    method: 'applyDataSourceDirective' | 'applyGridRowsDirective' | 'applyFormValuesDirective' | 'applyFormFieldDirective' | 'applySearchFiltersDirective',
  ) => registerLowCodeRuntimeDirective(handler, (directive, event, context) => context[method](directive, event));

  apply('dataSource', 'applyDataSourceDirective');
  apply('gridRows', 'applyGridRowsDirective');
  apply('formValues', 'applyFormValuesDirective');
  apply('formField', 'applyFormFieldDirective');
  apply('searchFilters', 'applySearchFiltersDirective');
  registerLowCodeRuntimeDirective('refreshSources', async (directive, event, context) => {
    await context.refreshDataSources(context.resolveDirectiveSourceKeys(directive, event));
  });
  registerLowCodeRuntimeDirective('refreshPage', (_directive, _event, context) => context.refreshPage());
  registerLowCodeRuntimeDirective('invokeService', (directive, event, context) =>
    context.invokeServiceDirective(directive, event));
  registerLowCodeRuntimeDirective('navigate', async (directive, event, context) => {
    await context.navigate(context.resolveDirectiveString(directive.route ?? directive.value, event));
  });
  registerLowCodeRuntimeDirective('showMessage', (directive, event, context) =>
    context.setRuntimeMessage(directive, event));
  registerLowCodeRuntimeDirective('emitEvent', (directive, event, context) => context.emitRuntimeEvent({
    name: context.resolveDirectiveString(directive.event, event),
    blockId: event.blockId,
    blockKind: event.blockKind,
    timestamp: Date.now(),
    payload: context.resolveDirectiveRecord(directive.payload ?? {}, event),
  }));
  registerLowCodeRuntimeDirective('dispatchBrowserEvent', (directive, event, context) => {
    if (typeof window === 'undefined') return;
    const name = context.resolveDirectiveString(
      directive.event ?? directive.name ?? directive.value,
      event,
    );
    if (name) window.dispatchEvent(new CustomEvent(name, {
      detail: context.resolveDirectiveRecord(directive.payload ?? {}, event),
    }));
  });
  registerLowCodeRuntimeDirective('openBlock', (directive, event, context) =>
    context.setBlockOpen(context.resolveDirectiveString(directive.blockId, event), true));
  registerLowCodeRuntimeDirective('closeBlock', (directive, event, context) =>
    context.setBlockOpen(context.resolveDirectiveString(directive.blockId, event), false));
  registerLowCodeRuntimeDirective('toggleBlock', (directive, event, context) => {
    const blockId = context.resolveDirectiveString(directive.blockId, event);
    if (blockId) context.toggleBlockOpen(blockId);
  });
  registerLowCodeRuntimeDirective('openGlobalDialog', (directive, event, context) =>
    context.openGlobalDialog?.(directive, event));
  registerLowCodeRuntimeDirective(
    'openPageReferenceDialog',
    (directive, event, context) => context.openPageReferenceDialog?.(directive, event),
  );

  // Legacy spellings remain local fallbacks for pages loaded without the catalog;
  // published pages resolve their handler through lowcode_page_runtime first.
  const alias = (types: string[], handler: string) => types.forEach((type) =>
    registerLowCodeRuntimeDirective(type, getLowCodeRuntimeDirective(handler)!));
  alias(['setDataSource', 'updateDataSource'], 'dataSource');
  alias(['setGridRows', 'updateGridRows'], 'gridRows');
  alias(['setFormValues', 'updateFormModel', 'setFormData', 'updateFormData'], 'formValues');
  alias(['setFormField', 'updateFormField'], 'formField');
  alias(['setSearchFilters', 'updateSearchFilters'], 'searchFilters');
  alias(['refreshDataSource', 'refreshDataSources'], 'refreshSources');
  alias(['routePush'], 'navigate');
  alias(['dispatchWindowEvent'], 'dispatchBrowserEvent');
  alias(['openBlock', 'openModal'], 'openBlock');
  alias(['closeBlock', 'closeModal'], 'closeBlock');
  alias(['toggleModal'], 'toggleBlock');
  alias(['openGlobalDialog', 'openDialog'], 'openGlobalDialog');
  alias(['openPageReferenceDialog', 'openLowCodePageReferenceDialog', 'openReferenceDialog'], 'openPageReferenceDialog');
}

registerDefaultLowCodeRuntimeDirectives();
