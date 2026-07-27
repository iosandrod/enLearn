import type { LowCodeRuntimeDirective, LowCodeRuntimeEvent } from '../types/lowcode';

export type LowCodeRuntimeDirectiveContext = {
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
  ): void;
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

  const handler = getLowCodeRuntimeDirective(directive.type.trim());
  if (!handler) return;

  await handler(directive, event, context);
}

export function registerDefaultLowCodeRuntimeDirectives() {
  if (defaultDirectivesRegistered) return;
  defaultDirectivesRegistered = true;

  registerLowCodeRuntimeDirectiveAliases(
    ['setDataSource', 'updateDataSource'],
    (directive, event, context) => context.applyDataSourceDirective(directive, event)
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['setGridRows', 'updateGridRows'],
    (directive, event, context) => context.applyGridRowsDirective(directive, event)
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['setFormValues', 'updateFormModel', 'setFormData', 'updateFormData'],
    (directive, event, context) => context.applyFormValuesDirective(directive, event)
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['setFormField', 'updateFormField'],
    (directive, event, context) => context.applyFormFieldDirective(directive, event)
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['setSearchFilters', 'updateSearchFilters'],
    (directive, event, context) => context.applySearchFiltersDirective(directive, event)
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['refreshDataSource', 'refreshDataSources'],
    async (directive, event, context) => {
      await context.refreshDataSources(context.resolveDirectiveSourceKeys(directive, event));
    }
  );

  registerLowCodeRuntimeDirective('refreshPage', (_directive, _event, context) =>
    context.refreshPage()
  );

  registerLowCodeRuntimeDirective('invokeService', (directive, event, context) =>
    context.invokeServiceDirective(directive, event)
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['navigate', 'routePush'],
    async (directive, event, context) => {
      await context.navigate(context.resolveDirectiveString(directive.route ?? directive.value, event));
    }
  );

  registerLowCodeRuntimeDirective('showMessage', (directive, event, context) =>
    context.setRuntimeMessage(directive, event)
  );

  registerLowCodeRuntimeDirective('emitEvent', (directive, event, context) =>
    context.emitRuntimeEvent({
      name: context.resolveDirectiveString(directive.event, event),
      blockId: event.blockId,
      blockKind: event.blockKind,
      timestamp: Date.now(),
      payload: context.resolveDirectiveRecord(directive.payload ?? {}, event),
    })
  );

  registerLowCodeRuntimeDirectiveAliases(
    ['dispatchWindowEvent', 'dispatchBrowserEvent'],
    (directive, event, context) => {
      if (typeof window === 'undefined') return;

      const name = context.resolveDirectiveString(
        directive.event ?? directive.name ?? directive.value,
        event
      );
      if (!name) return;

      window.dispatchEvent(
        new CustomEvent(name, {
          detail: context.resolveDirectiveRecord(directive.payload ?? {}, event),
        })
      );
    }
  );

  registerLowCodeRuntimeDirective('openBlock', (directive, event, context) =>
    context.setBlockOpen(context.resolveDirectiveString(directive.blockId, event), true)
  );

  registerLowCodeRuntimeDirective('closeBlock', (directive, event, context) =>
    context.setBlockOpen(context.resolveDirectiveString(directive.blockId, event), false)
  );
}

registerDefaultLowCodeRuntimeDirectives();
