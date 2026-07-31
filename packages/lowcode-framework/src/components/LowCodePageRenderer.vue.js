/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import GlobalDialogHost from './GlobalDialogHost';
import LowCodeOverlayHost from './LowCodeOverlayHost.vue';
import { createLowCodeEventBus, normalizeLowCodeDirectives, resolveEventDirectives } from '../lowcode/event-system';
import { useLowCodeHost, } from '../core/host';
import { executeLowCodeRuntimeDirective, } from '../runtime/directives';
import { openGlobalDialog as openLowCodeGlobalDialog, } from '../runtime/global-dialog';
const props = defineProps();
const host = useLowCodeHost(() => ({
    serviceApi: props.serviceApi,
    router: props.router,
    route: props.route,
    locale: props.locale,
    messages: props.messages,
    theme: props.theme,
}));
const loadingBlockId = ref('');
const loadingGridId = ref('');
const message = ref('');
const messageClass = ref('lc-help');
const dataLoading = ref(false);
const resolvedData = reactive({});
const formModels = reactive({});
const searchFilters = reactive({});
const runtimeEventBus = createLowCodeEventBus();
let loadSequence = 0;
const themeClass = computed(() => host.getTheme().className);
const themeStyle = computed(() => Object.fromEntries(Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])));
const layoutBlocks = computed(() => props.page.schema.blocks.filter((block) => !isOverlayBlock(block)));
const pageOverlays = computed(() => [
    ...props.page.schema.blocks.filter(isOverlayBlock),
    ...(props.page.schema.overlays ?? []),
]);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isOverlayBlock(block) {
    return block.kind === 'modal' || block.kind === 'drawer';
}
function clearObject(target) {
    Object.keys(target).forEach((key) => delete target[key]);
}
function readPath(source, path) {
    return path.split('.').reduce((current, segment) => {
        if (typeof current !== 'object' || current === null) {
            return undefined;
        }
        return current[segment];
    }, source);
}
function toExpressionScope(scopeOrRow = {}) {
    if ('event' in scopeOrRow ||
        'row' in scopeOrRow ||
        'value' in scopeOrRow ||
        'values' in scopeOrRow) {
        return scopeOrRow;
    }
    return { row: scopeOrRow };
}
function resolveExpression(expression, scopeOrRow = {}) {
    const scope = toExpressionScope(scopeOrRow);
    const eventPayload = scope.event?.payload ?? {};
    const currentBlockId = scope.event?.blockId ?? '';
    const currentForm = currentBlockId ? formModels[currentBlockId] ?? {} : {};
    const currentRoute = host.getRoute();
    const expressionRoot = {
        row: scope.row ?? (isRecord(eventPayload.row) ? eventPayload.row : {}),
        route: {
            query: currentRoute.query ?? {},
            params: currentRoute.params ?? {},
            path: currentRoute.path ?? '',
            fullPath: currentRoute.fullPath ?? ''
        },
        data: resolvedData,
        form: currentForm,
        forms: formModels,
        search: searchFilters,
        event: {
            ...eventPayload,
            name: scope.event?.name,
            blockId: scope.event?.blockId,
            blockKind: scope.event?.blockKind
        },
        value: scope.value ?? eventPayload.value,
        values: scope.values ?? (isRecord(eventPayload.values) ? eventPayload.values : {})
    };
    return readPath(expressionRoot, expression.trim());
}
function resolveRuntimeValue(value, scopeOrRow = {}) {
    if (typeof value === 'string') {
        const singleExpression = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
        if (singleExpression) {
            return resolveExpression(singleExpression[1], scopeOrRow) ?? '';
        }
        return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => String(resolveExpression(expression, scopeOrRow) ?? ''));
    }
    if (Array.isArray(value)) {
        return value.map((item) => resolveRuntimeValue(item, scopeOrRow));
    }
    if (isRecord(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRuntimeValue(item, scopeOrRow)]));
    }
    return value;
}
function resolveRuntimePostData(postData) {
    return resolveRuntimeValue(postData ?? {});
}
function resolveRuntimeRoute(path, row = {}) {
    return resolveRuntimeValue(path, row);
}
function readString(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function readRelationMetadataString(relation, key, fallback = '') {
    return readString(relation?.metadata?.[key], fallback);
}
function findPageRelation(actionKey, block) {
    const relations = props.page.relations?.outgoing ?? [];
    const blockActionKey = block ? `${block.id}.${actionKey}` : '';
    return ((blockActionKey
        ? relations.find((relation) => relation.actionKey === blockActionKey)
        : undefined) ??
        relations.find((relation) => {
            if (relation.actionKey !== actionKey)
                return false;
            const blockId = readRelationMetadataString(relation, 'blockId');
            return !block || !blockId || blockId === block.id;
        }));
}
function getGridRowKey(block, relation) {
    const metadataRowKey = readRelationMetadataString(relation, 'rowKey');
    if (metadataRowKey)
        return metadataRowKey;
    const rowConfig = block.schema.grid.rowConfig;
    return isRecord(rowConfig) ? readString(rowConfig.keyField, 'id') : 'id';
}
function appendRouteQuery(route, query) {
    const entries = Object.entries(query).filter(([, value]) => typeof value !== 'undefined' && value !== null && value !== '');
    if (!entries.length)
        return route;
    const [withoutHash, hash = ''] = route.split('#');
    const separator = withoutHash.includes('?') ? '&' : '?';
    const queryString = entries
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
    return `${withoutHash}${separator}${queryString}${hash ? `#${hash}` : ''}`;
}
function resolveRelationRoute(relation, block, row) {
    const route = readString(relation.targetPageRoute);
    if (!route)
        return '';
    const rowKey = getGridRowKey(block, relation);
    const queryKey = readRelationMetadataString(relation, 'queryKey', rowKey);
    const resolvedRoute = resolveRuntimeRoute(route, row);
    return appendRouteQuery(resolvedRoute, {
        fromPage: props.page.code,
        [queryKey]: row[rowKey],
    });
}
function getDataSource(key) {
    if (!key)
        return undefined;
    return props.page.schema.dataSources?.[key];
}
async function invokeDataSource(key, source, force = false) {
    if (!force && source.autoLoad === false) {
        return [key, undefined];
    }
    const data = await host.getServiceApi().invoke(source.serviceName, source.serviceMethod, resolveRuntimePostData(source.postData));
    return [key, data];
}
async function refreshDataSources(sourceKeys = []) {
    const allEntries = Object.entries(props.page.schema.dataSources ?? {});
    const entries = sourceKeys.length
        ? sourceKeys
            .map((key) => {
            const source = getDataSource(key);
            return source ? [key, source] : undefined;
        })
            .filter((entry) => Boolean(entry))
        : allEntries;
    const results = await Promise.allSettled(entries.map(([key, source]) => invokeDataSource(key, source, true)));
    const errors = [];
    results.forEach((result, index) => {
        const [key] = entries[index];
        if (result.status === 'fulfilled') {
            const [resolvedKey, value] = result.value;
            if (typeof value !== 'undefined') {
                resolvedData[resolvedKey] = value;
            }
            return;
        }
        errors.push(`${key}: ${result.reason instanceof Error ? result.reason.message : host.t('runtime.errors.refreshDataSource')}`);
    });
    if (errors.length) {
        message.value = errors[0];
        messageClass.value = 'lc-error';
    }
    return errors;
}
function getChildBlocks(block) {
    const children = [];
    if ('blocks' in block && Array.isArray(block.blocks)) {
        children.push(...block.blocks);
    }
    if (block.kind === 'tabs') {
        children.push(...block.tabs.flatMap((tab) => tab.blocks));
    }
    if (isOverlayBlock(block) && Array.isArray(block.overlays)) {
        children.push(...block.overlays);
    }
    return children;
}
function flattenBlocks(blocks) {
    return blocks.flatMap((block) => [block, ...flattenBlocks(getChildBlocks(block))]);
}
function flattenPageBlocks(schema) {
    return flattenBlocks([
        ...schema.blocks,
        ...(schema.overlays ?? []),
    ]);
}
function getFormBlockTarget(block) {
    const blocks = flattenPageBlocks(props.page.schema);
    if (block.editorBlockId) {
        const target = blocks.find((pageBlock) => pageBlock.kind === 'form' && pageBlock.id === block.editorBlockId);
        if (target && target.kind === 'form') {
            return target;
        }
    }
    return blocks.find((pageBlock) => pageBlock.kind === 'form');
}
function findRuntimeBlock(blockId) {
    return flattenPageBlocks(props.page.schema).find((block) => block.id === blockId);
}
function deriveFormModel(block, row) {
    const nextModel = {
        ...(block.initialValues ?? {})
    };
    if (row && isRecord(row)) {
        Object.assign(nextModel, row);
    }
    return nextModel;
}
async function loadPageData(nextPage) {
    const entries = Object.entries(nextPage.schema.dataSources ?? {});
    clearObject(resolvedData);
    clearObject(formModels);
    clearObject(searchFilters);
    for (const block of flattenPageBlocks(nextPage.schema)) {
        if (block.kind === 'form' || block.kind === 'searchForm') {
            formModels[block.id] = deriveFormModel(block);
        }
    }
    if (!entries.length) {
        return [];
    }
    const results = await Promise.allSettled(entries.map(async ([key, source]) => {
        if (source.autoLoad === false) {
            return [key, undefined];
        }
        const data = await host.getServiceApi().invoke(source.serviceName, source.serviceMethod, resolveRuntimePostData(source.postData));
        return [key, data];
    }));
    const errors = [];
    results.forEach((result, index) => {
        const [key] = entries[index];
        if (result.status === 'fulfilled') {
            const [resolvedKey, value] = result.value;
            if (typeof value !== 'undefined') {
                resolvedData[resolvedKey] = value;
            }
            return;
        }
        errors.push(`${key}: ${result.reason instanceof Error ? result.reason.message : host.t('runtime.errors.loadDataSource')}`);
    });
    for (const block of flattenPageBlocks(nextPage.schema)) {
        if (block.kind !== 'form')
            continue;
        const source = getDataSource(block.sourceKey ?? block.submitSourceKey);
        const sourceValue = source ? resolvedData[source.key] : undefined;
        if (isRecord(sourceValue)) {
            formModels[block.id] = {
                ...formModels[block.id],
                ...sourceValue
            };
        }
    }
    return errors;
}
const loadingText = computed(() => dataLoading.value ? host.t('runtime.loadingDataSources') : '');
watch([() => props.page, () => host.getRoute().fullPath], async ([nextPage]) => {
    const currentLoad = ++loadSequence;
    message.value = '';
    dataLoading.value = true;
    try {
        const errors = await loadPageData(nextPage);
        if (currentLoad !== loadSequence) {
            return;
        }
        if (errors.length) {
            message.value = errors[0];
            messageClass.value = 'lc-error';
        }
    }
    catch (error) {
        if (currentLoad !== loadSequence) {
            return;
        }
        message.value =
            error instanceof Error ? error.message : host.t('runtime.errors.loadPage');
        messageClass.value = 'lc-error';
    }
    finally {
        if (currentLoad === loadSequence) {
            dataLoading.value = false;
        }
    }
}, { immediate: true });
const unsubscribeRuntimeEvents = runtimeEventBus.subscribe(handlePublishedRuntimeEvent);
onBeforeUnmount(unsubscribeRuntimeEvents);
async function publishRuntimeEvent(event) {
    try {
        await runtimeEventBus.publish(event);
    }
    catch (error) {
        reportRuntimeDirectiveError(error);
    }
}
async function handlePublishedRuntimeEvent(event) {
    const directives = resolveEventDirectives(event, props.page.schema.eventHandlers);
    for (const directive of directives) {
        try {
            await executeRuntimeDirective(directive, event);
        }
        catch (error) {
            reportRuntimeDirectiveError(error);
            break;
        }
    }
}
function reportRuntimeDirectiveError(error) {
    message.value =
        error instanceof Error ? error.message : host.t('runtime.errors.directive');
    messageClass.value = 'lc-error';
}
function eventRow(event) {
    return isRecord(event.payload?.row) ? event.payload.row : {};
}
function directiveScope(event) {
    return {
        event,
        row: eventRow(event),
        value: event.payload?.value,
        values: isRecord(event.payload?.values) ? event.payload.values : {},
    };
}
function resolveDirectiveString(value, event, fallback = '') {
    const resolved = resolveRuntimeValue(value, directiveScope(event));
    if (typeof resolved === 'string')
        return resolved.trim() || fallback;
    if (typeof resolved === 'number' || typeof resolved === 'boolean')
        return String(resolved);
    return fallback;
}
function resolveDirectiveRecord(value, event) {
    const resolved = resolveRuntimeValue(value, directiveScope(event));
    return isRecord(resolved) ? resolved : {};
}
function resolveDirectiveData(directive, event) {
    const rawValue = typeof directive.value !== 'undefined'
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
function resolveDirectiveSourceKeys(directive, event) {
    if (Array.isArray(directive.sourceKeys)) {
        return directive.sourceKeys
            .map((key) => resolveDirectiveString(key, event))
            .filter(Boolean);
    }
    const sourceKey = resolveDirectiveString(directive.sourceKey, event);
    return sourceKey ? [sourceKey] : [];
}
function normalizeRows(value) {
    if (Array.isArray(value))
        return value.filter(isRecord);
    return isRecord(value) ? [value] : [];
}
function resolveRowKey(directive, event) {
    return resolveDirectiveString(directive.rowKey, event, 'id');
}
function isTruthyRuntimeValue(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return Boolean(normalized) && !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
    }
    return Boolean(value);
}
function shouldExecuteDirective(directive, event) {
    if (directive.disabled)
        return false;
    if (typeof directive.when === 'undefined')
        return true;
    return isTruthyRuntimeValue(resolveRuntimeValue(directive.when, directiveScope(event)));
}
function mergeDataSourceValue(currentValue, nextValue, directive, event) {
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
            }
            else {
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
function applyDataSourceDirective(directive, event) {
    const [sourceKey] = resolveDirectiveSourceKeys(directive, event);
    if (!sourceKey)
        return;
    resolvedData[sourceKey] = mergeDataSourceValue(resolvedData[sourceKey], resolveDirectiveData(directive, event), directive, event);
}
function applyGridRowsDirective(directive, event) {
    const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
    if (!blockId)
        return;
    const target = findRuntimeBlock(blockId);
    if (!target || target.kind !== 'grid')
        return;
    const nextValue = resolveDirectiveData(directive, event);
    if (target.sourceKey) {
        resolvedData[target.sourceKey] = mergeDataSourceValue(resolvedData[target.sourceKey], nextValue, directive, event);
        return;
    }
    target.rows = mergeDataSourceValue(target.rows ?? [], nextValue, directive, event);
}
function applyFormValuesDirective(directive, event) {
    const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
    if (!blockId)
        return;
    const nextValues = resolveDirectiveRecord(directive.values ?? directive.value ?? event.payload?.values ?? event.payload?.row, event);
    if (directive.mode === 'replace') {
        formModels[blockId] = { ...nextValues };
        return;
    }
    formModels[blockId] = {
        ...(formModels[blockId] ?? {}),
        ...nextValues,
    };
}
function applyFormFieldDirective(directive, event) {
    const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
    const field = resolveDirectiveString(directive.field, event);
    if (!blockId || !field)
        return;
    formModels[blockId] = {
        ...(formModels[blockId] ?? {}),
        [field]: resolveRuntimeValue(directive.value, directiveScope(event)),
    };
}
function applySearchFiltersDirective(directive, event) {
    const [sourceKey] = resolveDirectiveSourceKeys(directive, event);
    if (!sourceKey)
        return;
    const values = resolveDirectiveRecord(directive.values ?? directive.value ?? event.payload?.values, event);
    searchFilters[sourceKey] =
        directive.mode === 'replace'
            ? { ...values }
            : {
                ...(searchFilters[sourceKey] ?? {}),
                ...values,
            };
}
function setRuntimeMessage(directive, event) {
    const nextMessage = resolveDirectiveString(directive.message ?? directive.value, event);
    if (!nextMessage)
        return;
    message.value = nextMessage;
    messageClass.value = directive.status === 'error' ? 'lc-error' : 'lc-help';
}
async function invokeServiceDirective(directive, event) {
    const sourceKey = resolveDirectiveString(directive.sourceKey, event);
    const source = getDataSource(sourceKey);
    const serviceName = resolveDirectiveString(directive.serviceName, event, source?.serviceName);
    const serviceMethod = resolveDirectiveString(directive.serviceMethod, event, source?.serviceMethod);
    if (!serviceName || !serviceMethod)
        return;
    const postData = resolveRuntimeValue(directive.postData ?? source?.postData ?? {}, directiveScope(event));
    const result = await host.getServiceApi().invoke(serviceName, serviceMethod, postData);
    const assignTo = resolveDirectiveString(directive.assignTo, event);
    if (assignTo) {
        resolvedData[assignTo] = mergeDataSourceValue(resolvedData[assignTo], result, directive, event);
    }
    if (directive.refreshSourceKeys?.length) {
        await refreshDataSources(directive.refreshSourceKeys
            .map((key) => resolveDirectiveString(key, event))
            .filter(Boolean));
    }
}
function resolveDialogFollowUpDirectives(directive, action) {
    const actionKey = `${action}Directives`;
    const actionDirectives = directive[actionKey];
    return normalizeLowCodeDirectives(actionDirectives ??
        (action === 'confirm'
            ? directive.confirmDirectives
            : action === 'cancel'
                ? directive.cancelDirectives
                : directive.closeDirectives));
}
async function openGlobalDialogDirective(directive, event) {
    const rawConfig = resolveRuntimeValue(directive.config ?? directive.value ?? {}, directiveScope(event));
    if (!isRecord(rawConfig))
        return;
    const config = rawConfig;
    const model = resolveDirectiveRecord(directive.model ?? config.model ?? config.form?.model ?? {}, event);
    const result = await openLowCodeGlobalDialog({
        ...config,
        model,
        form: config.form
            ? {
                ...config.form,
                model,
            }
            : config.form,
    });
    const followUpDirectives = resolveDialogFollowUpDirectives(directive, result.action);
    const resultEvent = resolveDirectiveString(directive.resultEvent ?? directive.event, event, `dialog.${result.action}`);
    if (!resultEvent && !followUpDirectives.length)
        return;
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
function setBlockOpen(blockId, open) {
    const target = findRuntimeBlock(blockId);
    if (target && 'open' in target) {
        target.open = open;
        if (!open && isOverlayBlock(target)) {
            closeNestedOverlays(target);
        }
    }
}
function closeNestedOverlays(block) {
    (block.overlays ?? []).forEach((overlay) => {
        overlay.open = false;
        closeNestedOverlays(overlay);
    });
}
function toggleBlockOpen(blockId) {
    const target = findRuntimeBlock(blockId);
    if (target && 'open' in target) {
        setBlockOpen(blockId, target.open === false);
    }
}
async function executeRuntimeDirective(directive, event) {
    const directiveContext = {
        shouldExecuteDirective,
        resolveDirectiveString,
        resolveDirectiveRecord,
        resolveDirectiveSourceKeys,
        applyDataSourceDirective,
        applyGridRowsDirective,
        applyFormValuesDirective,
        applyFormFieldDirective,
        applySearchFiltersDirective,
        refreshDataSources,
        refreshPage: () => loadPageData(props.page).then(() => undefined),
        invokeServiceDirective,
        navigate: (route) => (route ? host.getRouter().push(route) : undefined),
        setRuntimeMessage,
        emitRuntimeEvent: publishRuntimeEvent,
        setBlockOpen,
        toggleBlockOpen,
        openGlobalDialog: openGlobalDialogDirective,
    };
    await executeLowCodeRuntimeDirective(directive, event, directiveContext);
}
async function handleFormSubmit(block, values) {
    if (block.kind !== 'form')
        return;
    const source = getDataSource(block.submitSourceKey ?? block.sourceKey);
    if (!source) {
        return;
    }
    loadingBlockId.value = block.id;
    message.value = '';
    try {
        await host.getServiceApi().invoke(source.serviceName, source.saveMethod ?? source.serviceMethod, {
            ...(source.postData ?? {}),
            ...values
        });
        message.value = host.t('runtime.form.saved');
        messageClass.value = 'lc-help';
        await loadPageData(props.page);
    }
    catch (error) {
        message.value =
            error instanceof Error ? error.message : host.t('runtime.form.submitFailed');
        messageClass.value = 'lc-error';
    }
    finally {
        loadingBlockId.value = '';
    }
}
async function handleFormAction(block, action, values) {
    if (action.route) {
        await host.getRouter().push(resolveRuntimeRoute(action.route, values));
        return;
    }
    if (action.code === 'submit') {
        await handleFormSubmit(block, values);
    }
}
async function handleToolbarAction(action) {
    if (action.route) {
        await host.getRouter().push(resolveRuntimeRoute(action.route));
        return;
    }
    if (action.code === 'refresh') {
        await loadPageData(props.page);
    }
}
function handleSearchSubmit(block, values) {
    if (!block.targetSourceKey)
        return;
    searchFilters[block.targetSourceKey] = { ...values };
}
function handleSearchAction(block, action, values) {
    if (action.type === 'reset' && block.targetSourceKey) {
        searchFilters[block.targetSourceKey] = {};
        return;
    }
    if (action.code === 'submit') {
        handleSearchSubmit(block, values);
    }
}
async function handleGridEdit(block, row) {
    const editRelation = findPageRelation('edit', block);
    const relationRoute = editRelation ? resolveRelationRoute(editRelation, block, row) : '';
    if (relationRoute) {
        await host.getRouter().push(relationRoute);
        return;
    }
    const editRoute = block.editRoute ?? block.schema.rowActions?.editRoute;
    if (editRoute) {
        await host.getRouter().push(resolveRuntimeRoute(editRoute, row));
        return;
    }
    const formBlock = getFormBlockTarget(block);
    if (!formBlock) {
        return;
    }
    formModels[formBlock.id] = deriveFormModel(formBlock, row);
    message.value = '';
}
async function handleGridDelete(block, row) {
    const source = getDataSource(block.deleteSourceKey ?? block.sourceKey);
    if (!source) {
        return;
    }
    loadingGridId.value = block.id;
    message.value = '';
    try {
        await host.getServiceApi().invoke(source.serviceName, source.deleteMethod ?? source.serviceMethod, {
            ...(source.postData ?? {}),
            ...row
        });
        message.value = host.t('runtime.grid.deleted');
        messageClass.value = 'lc-help';
        await loadPageData(props.page);
    }
    catch (error) {
        message.value =
            error instanceof Error ? error.message : host.t('runtime.grid.deleteFailed');
        messageClass.value = 'lc-error';
    }
    finally {
        loadingGridId.value = '';
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lowcode-runtime-page" },
    ...{ class: (__VLS_ctx.themeClass) },
    ...{ style: (__VLS_ctx.themeStyle) },
});
/** @type {__VLS_StyleScopedClasses['lowcode-runtime-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "page-intro" },
});
/** @type {__VLS_StyleScopedClasses['page-intro']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
(__VLS_ctx.page.schema.title);
if (__VLS_ctx.dataLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "content-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "page-description" },
    });
    /** @type {__VLS_StyleScopedClasses['page-description']} */ ;
    (__VLS_ctx.loadingText);
}
for (const [block] of __VLS_vFor((__VLS_ctx.layoutBlocks))) {
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.LowCodeBlockRenderer} */
    LowCodeBlockRenderer;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ 'onFormSubmit': {} },
        ...{ 'onFormAction': {} },
        ...{ 'onGridEdit': {} },
        ...{ 'onGridDelete': {} },
        ...{ 'onToolbarAction': {} },
        ...{ 'onSearchSubmit': {} },
        ...{ 'onSearchAction': {} },
        ...{ 'onRuntimeEvent': {} },
        key: (block.id),
        block: (block),
        resolvedData: (__VLS_ctx.resolvedData),
        formModels: (__VLS_ctx.formModels),
        searchFilters: (__VLS_ctx.searchFilters),
        loadingBlockId: (__VLS_ctx.loadingBlockId),
        loadingGridId: (__VLS_ctx.loadingGridId),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onFormSubmit': {} },
        ...{ 'onFormAction': {} },
        ...{ 'onGridEdit': {} },
        ...{ 'onGridDelete': {} },
        ...{ 'onToolbarAction': {} },
        ...{ 'onSearchSubmit': {} },
        ...{ 'onSearchAction': {} },
        ...{ 'onRuntimeEvent': {} },
        key: (block.id),
        block: (block),
        resolvedData: (__VLS_ctx.resolvedData),
        formModels: (__VLS_ctx.formModels),
        searchFilters: (__VLS_ctx.searchFilters),
        loadingBlockId: (__VLS_ctx.loadingBlockId),
        loadingGridId: (__VLS_ctx.loadingGridId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.formSubmit} */
        onFormSubmit: (({ block: formBlock, values }) => __VLS_ctx.handleFormSubmit(formBlock, values)),
    };
    const __VLS_7 = {
        /** @type {typeof __VLS_5.formAction} */
        onFormAction: (({ block: formBlock, action, values }) => __VLS_ctx.handleFormAction(formBlock, action, values)),
    };
    const __VLS_8 = {
        /** @type {typeof __VLS_5.gridEdit} */
        onGridEdit: (({ block: gridBlock, row }) => __VLS_ctx.handleGridEdit(gridBlock, row)),
    };
    const __VLS_9 = {
        /** @type {typeof __VLS_5.gridDelete} */
        onGridDelete: (({ block: gridBlock, row }) => __VLS_ctx.handleGridDelete(gridBlock, row)),
    };
    const __VLS_10 = {
        /** @type {typeof __VLS_5.toolbarAction} */
        onToolbarAction: (({ action }) => __VLS_ctx.handleToolbarAction(action)),
    };
    const __VLS_11 = {
        /** @type {typeof __VLS_5.searchSubmit} */
        onSearchSubmit: (({ block: searchBlock, values }) => __VLS_ctx.handleSearchSubmit(searchBlock, values)),
    };
    const __VLS_12 = {
        /** @type {typeof __VLS_5.searchAction} */
        onSearchAction: (({ block: searchBlock, action, values }) => __VLS_ctx.handleSearchAction(searchBlock, action, values)),
    };
    const __VLS_13 = {
        /** @type {typeof __VLS_5.runtimeEvent} */
        onRuntimeEvent: (__VLS_ctx.publishRuntimeEvent),
    };
    var __VLS_3;
    var __VLS_4;
    // @ts-ignore
    [themeClass, themeStyle, page, dataLoading, loadingText, layoutBlocks, resolvedData, formModels, searchFilters, loadingBlockId, loadingGridId, handleFormSubmit, handleFormAction, handleGridEdit, handleGridDelete, handleToolbarAction, handleSearchSubmit, handleSearchAction, publishRuntimeEvent,];
}
if (__VLS_ctx.pageOverlays.length) {
    const __VLS_14 = LowCodeOverlayHost;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
        ...{ 'onFormSubmit': {} },
        ...{ 'onFormAction': {} },
        ...{ 'onGridEdit': {} },
        ...{ 'onGridDelete': {} },
        ...{ 'onToolbarAction': {} },
        ...{ 'onSearchSubmit': {} },
        ...{ 'onSearchAction': {} },
        ...{ 'onRuntimeEvent': {} },
        overlays: (__VLS_ctx.pageOverlays),
        resolvedData: (__VLS_ctx.resolvedData),
        formModels: (__VLS_ctx.formModels),
        searchFilters: (__VLS_ctx.searchFilters),
        loadingBlockId: (__VLS_ctx.loadingBlockId),
        loadingGridId: (__VLS_ctx.loadingGridId),
    }));
    const __VLS_16 = __VLS_15({
        ...{ 'onFormSubmit': {} },
        ...{ 'onFormAction': {} },
        ...{ 'onGridEdit': {} },
        ...{ 'onGridDelete': {} },
        ...{ 'onToolbarAction': {} },
        ...{ 'onSearchSubmit': {} },
        ...{ 'onSearchAction': {} },
        ...{ 'onRuntimeEvent': {} },
        overlays: (__VLS_ctx.pageOverlays),
        resolvedData: (__VLS_ctx.resolvedData),
        formModels: (__VLS_ctx.formModels),
        searchFilters: (__VLS_ctx.searchFilters),
        loadingBlockId: (__VLS_ctx.loadingBlockId),
        loadingGridId: (__VLS_ctx.loadingGridId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    let __VLS_19;
    const __VLS_20 = {
        /** @type {typeof __VLS_19.formSubmit} */
        onFormSubmit: (({ block: formBlock, values }) => __VLS_ctx.handleFormSubmit(formBlock, values)),
    };
    const __VLS_21 = {
        /** @type {typeof __VLS_19.formAction} */
        onFormAction: (({ block: formBlock, action, values }) => __VLS_ctx.handleFormAction(formBlock, action, values)),
    };
    const __VLS_22 = {
        /** @type {typeof __VLS_19.gridEdit} */
        onGridEdit: (({ block: gridBlock, row }) => __VLS_ctx.handleGridEdit(gridBlock, row)),
    };
    const __VLS_23 = {
        /** @type {typeof __VLS_19.gridDelete} */
        onGridDelete: (({ block: gridBlock, row }) => __VLS_ctx.handleGridDelete(gridBlock, row)),
    };
    const __VLS_24 = {
        /** @type {typeof __VLS_19.toolbarAction} */
        onToolbarAction: (({ action }) => __VLS_ctx.handleToolbarAction(action)),
    };
    const __VLS_25 = {
        /** @type {typeof __VLS_19.searchSubmit} */
        onSearchSubmit: (({ block: searchBlock, values }) => __VLS_ctx.handleSearchSubmit(searchBlock, values)),
    };
    const __VLS_26 = {
        /** @type {typeof __VLS_19.searchAction} */
        onSearchAction: (({ block: searchBlock, action, values }) => __VLS_ctx.handleSearchAction(searchBlock, action, values)),
    };
    const __VLS_27 = {
        /** @type {typeof __VLS_19.runtimeEvent} */
        onRuntimeEvent: (__VLS_ctx.publishRuntimeEvent),
    };
    var __VLS_17;
    var __VLS_18;
}
if (__VLS_ctx.message) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: (__VLS_ctx.messageClass) },
    });
    (__VLS_ctx.message);
}
let __VLS_28;
/** @ts-ignore @type { | typeof __VLS_components.GlobalDialogHost} */
GlobalDialogHost;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
// @ts-ignore
[resolvedData, formModels, searchFilters, loadingBlockId, loadingGridId, handleFormSubmit, handleFormAction, handleGridEdit, handleGridDelete, handleToolbarAction, handleSearchSubmit, handleSearchAction, publishRuntimeEvent, pageOverlays, pageOverlays, message, message, messageClass,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
