const directiveRegistry = new Map();
let defaultDirectivesRegistered = false;
export function registerLowCodeRuntimeDirective(type, handler) {
    directiveRegistry.set(type, handler);
}
export function registerLowCodeRuntimeDirectiveAliases(types, handler) {
    types.forEach((type) => registerLowCodeRuntimeDirective(type, handler));
}
export function getLowCodeRuntimeDirective(type) {
    return type ? directiveRegistry.get(type) : undefined;
}
export function getLowCodeRuntimeDirectiveTypes() {
    return [...directiveRegistry.keys()];
}
export async function executeLowCodeRuntimeDirective(directive, event, context) {
    if (!context.shouldExecuteDirective(directive, event))
        return;
    const handler = getLowCodeRuntimeDirective(directive.type.trim());
    if (!handler)
        return;
    await handler(directive, event, context);
}
export function registerDefaultLowCodeRuntimeDirectives() {
    if (defaultDirectivesRegistered)
        return;
    defaultDirectivesRegistered = true;
    registerLowCodeRuntimeDirectiveAliases(['setDataSource', 'updateDataSource'], (directive, event, context) => context.applyDataSourceDirective(directive, event));
    registerLowCodeRuntimeDirectiveAliases(['setGridRows', 'updateGridRows'], (directive, event, context) => context.applyGridRowsDirective(directive, event));
    registerLowCodeRuntimeDirectiveAliases(['setFormValues', 'updateFormModel', 'setFormData', 'updateFormData'], (directive, event, context) => context.applyFormValuesDirective(directive, event));
    registerLowCodeRuntimeDirectiveAliases(['setFormField', 'updateFormField'], (directive, event, context) => context.applyFormFieldDirective(directive, event));
    registerLowCodeRuntimeDirectiveAliases(['setSearchFilters', 'updateSearchFilters'], (directive, event, context) => context.applySearchFiltersDirective(directive, event));
    registerLowCodeRuntimeDirectiveAliases(['refreshDataSource', 'refreshDataSources'], async (directive, event, context) => {
        await context.refreshDataSources(context.resolveDirectiveSourceKeys(directive, event));
    });
    registerLowCodeRuntimeDirective('refreshPage', (_directive, _event, context) => context.refreshPage());
    registerLowCodeRuntimeDirective('invokeService', (directive, event, context) => context.invokeServiceDirective(directive, event));
    registerLowCodeRuntimeDirectiveAliases(['navigate', 'routePush'], async (directive, event, context) => {
        await context.navigate(context.resolveDirectiveString(directive.route ?? directive.value, event));
    });
    registerLowCodeRuntimeDirective('showMessage', (directive, event, context) => context.setRuntimeMessage(directive, event));
    registerLowCodeRuntimeDirective('emitEvent', (directive, event, context) => context.emitRuntimeEvent({
        name: context.resolveDirectiveString(directive.event, event),
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: context.resolveDirectiveRecord(directive.payload ?? {}, event),
    }));
    registerLowCodeRuntimeDirectiveAliases(['dispatchWindowEvent', 'dispatchBrowserEvent'], (directive, event, context) => {
        if (typeof window === 'undefined')
            return;
        const name = context.resolveDirectiveString(directive.event ?? directive.name ?? directive.value, event);
        if (!name)
            return;
        window.dispatchEvent(new CustomEvent(name, {
            detail: context.resolveDirectiveRecord(directive.payload ?? {}, event),
        }));
    });
    registerLowCodeRuntimeDirectiveAliases(['openBlock', 'openModal'], (directive, event, context) => context.setBlockOpen(context.resolveDirectiveString(directive.blockId, event), true));
    registerLowCodeRuntimeDirectiveAliases(['closeBlock', 'closeModal'], (directive, event, context) => context.setBlockOpen(context.resolveDirectiveString(directive.blockId, event), false));
    registerLowCodeRuntimeDirective('toggleModal', (directive, event, context) => {
        const blockId = context.resolveDirectiveString(directive.blockId, event);
        if (!blockId)
            return;
        context.toggleBlockOpen(blockId);
    });
    registerLowCodeRuntimeDirectiveAliases(['openGlobalDialog', 'openDialog'], (directive, event, context) => context.openGlobalDialog?.(directive, event));
}
registerDefaultLowCodeRuntimeDirectives();
