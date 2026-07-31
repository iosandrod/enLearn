/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import LowCodeGrid from '../../../components/LowCodeGrid.vue';
import { resolveGridRows } from '../helpers';
const props = defineProps();
const emit = defineEmits();
function emitRuntimeEvent(name, payload) {
    emit('runtimeEvent', {
        name,
        blockId: props.block.id,
        blockKind: props.block.kind,
        timestamp: Date.now(),
        payload,
    });
}
function getGridEventDirectives(key) {
    const events = props.block.schema.events ?? {};
    return (events[key] ??
        (key === 'rowCurrentChange' ? events.currentRowChange : undefined) ??
        []);
}
function getGridEventName(key, fallback) {
    return props.block.schema.eventNames?.[key] ?? fallback;
}
function hasGridEventConfig(key) {
    return Boolean(props.block.schema.events?.[key] ||
        props.block.schema.eventNames?.[key] ||
        (key === 'rowCurrentChange' && props.block.schema.events?.currentRowChange));
}
function shouldPublishDesignedGridEvent(key) {
    if (!props.block.schema.events && !props.block.schema.eventNames)
        return true;
    return hasGridEventConfig(key);
}
function handleToolbar(code) {
    const action = props.block.schema.toolbar?.find((item) => item.code === code);
    emitRuntimeEvent(action?.eventName ?? 'grid.toolbarClick', {
        action,
        actionCode: code,
        directives: action?.directives ?? [],
    });
}
function handleEdit(row) {
    emitRuntimeEvent(getGridEventName('editClick', 'grid.editClick'), {
        row,
        actionCode: 'edit',
        directives: getGridEventDirectives('editClick'),
    });
    emit('gridEdit', { block: props.block, row });
}
function handleDelete(row) {
    emitRuntimeEvent(getGridEventName('deleteClick', 'grid.deleteClick'), {
        row,
        actionCode: 'delete',
        directives: getGridEventDirectives('deleteClick'),
    });
    emit('gridDelete', { block: props.block, row });
}
function handleRowAction(payload) {
    emitRuntimeEvent(payload.action.eventName ?? 'grid.rowAction', {
        row: payload.row,
        action: payload.action,
        actionCode: payload.action.code,
        directives: payload.action.directives ?? [],
    });
}
function handleRowCurrentChange(payload) {
    if (!shouldPublishDesignedGridEvent('rowCurrentChange'))
        return;
    emitRuntimeEvent(getGridEventName('rowCurrentChange', 'grid.rowCurrentChange'), {
        ...payload,
        directives: getGridEventDirectives('rowCurrentChange'),
    });
}
function handleRowDblclick(payload) {
    if (!shouldPublishDesignedGridEvent('rowDblclick'))
        return;
    emitRuntimeEvent(getGridEventName('rowDblclick', 'grid.rowDblclick'), {
        ...payload,
        directives: getGridEventDirectives('rowDblclick'),
    });
}
function handleCellDblclick(payload) {
    if (!shouldPublishDesignedGridEvent('cellDblclick'))
        return;
    emitRuntimeEvent(getGridEventName('cellDblclick', 'grid.cellDblclick'), {
        ...payload,
        directives: getGridEventDirectives('cellDblclick'),
    });
}
function handleGridEvent(payload) {
    if (!hasGridEventConfig(payload.key))
        return;
    emitRuntimeEvent(getGridEventName(payload.key, `grid.${payload.key}`), {
        ...payload,
        directives: getGridEventDirectives(payload.key),
    });
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ class: "content-panel" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
if (__VLS_ctx.block.title || __VLS_ctx.block.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "lc-node-header" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-node-header']} */ ;
    if (__VLS_ctx.block.title) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.block.title);
    }
    if (__VLS_ctx.block.description) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.block.description);
    }
}
const __VLS_0 = LowCodeGrid;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onEdit': {} },
    ...{ 'onDelete': {} },
    ...{ 'onRowAction': {} },
    ...{ 'onToolbar': {} },
    ...{ 'onRowCurrentChange': {} },
    ...{ 'onRowDblclick': {} },
    ...{ 'onCellDblclick': {} },
    ...{ 'onGridEvent': {} },
    schema: (__VLS_ctx.block.schema),
    rows: (__VLS_ctx.resolveGridRows(__VLS_ctx.block, __VLS_ctx.resolvedData, __VLS_ctx.searchFilters)),
    loading: (__VLS_ctx.loadingGridId === __VLS_ctx.block.id),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onEdit': {} },
    ...{ 'onDelete': {} },
    ...{ 'onRowAction': {} },
    ...{ 'onToolbar': {} },
    ...{ 'onRowCurrentChange': {} },
    ...{ 'onRowDblclick': {} },
    ...{ 'onCellDblclick': {} },
    ...{ 'onGridEvent': {} },
    schema: (__VLS_ctx.block.schema),
    rows: (__VLS_ctx.resolveGridRows(__VLS_ctx.block, __VLS_ctx.resolvedData, __VLS_ctx.searchFilters)),
    loading: (__VLS_ctx.loadingGridId === __VLS_ctx.block.id),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.edit} */
    onEdit: (__VLS_ctx.handleEdit),
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.delete} */
    onDelete: (__VLS_ctx.handleDelete),
};
const __VLS_8 = {
    /** @type {typeof __VLS_5.rowAction} */
    onRowAction: (__VLS_ctx.handleRowAction),
};
const __VLS_9 = {
    /** @type {typeof __VLS_5.toolbar} */
    onToolbar: (__VLS_ctx.handleToolbar),
};
const __VLS_10 = {
    /** @type {typeof __VLS_5.rowCurrentChange} */
    onRowCurrentChange: (__VLS_ctx.handleRowCurrentChange),
};
const __VLS_11 = {
    /** @type {typeof __VLS_5.rowDblclick} */
    onRowDblclick: (__VLS_ctx.handleRowDblclick),
};
const __VLS_12 = {
    /** @type {typeof __VLS_5.cellDblclick} */
    onCellDblclick: (__VLS_ctx.handleCellDblclick),
};
const __VLS_13 = {
    /** @type {typeof __VLS_5.gridEvent} */
    onGridEvent: (__VLS_ctx.handleGridEvent),
};
var __VLS_3;
var __VLS_4;
// @ts-ignore
[block, block, block, block, block, block, block, block, block, resolveGridRows, resolvedData, searchFilters, loadingGridId, handleEdit, handleDelete, handleRowAction, handleToolbar, handleRowCurrentChange, handleRowDblclick, handleCellDblclick, handleGridEvent,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
