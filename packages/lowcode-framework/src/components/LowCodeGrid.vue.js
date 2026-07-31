/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { normalizeLowCodeGridColumns } from '../utils/lowcode';
const props = defineProps();
const emit = defineEmits();
const customRowActions = computed(() => props.schema.rowActions?.actions ?? []);
const gridConfig = computed(() => {
    const baseGrid = props.schema.grid;
    const columns = props.schema.grid.columns;
    const nextConfig = columns?.length
        ? {
            ...baseGrid,
            columns: normalizeLowCodeGridColumns(columns)
        }
        : { ...baseGrid };
    if (props.schema.events?.rowCurrentChange ||
        props.schema.events?.currentRowChange ||
        props.schema.eventNames?.rowCurrentChange) {
        const rowConfig = isRecord(nextConfig.rowConfig) ? nextConfig.rowConfig : {};
        nextConfig.rowConfig = {
            ...rowConfig,
            isCurrent: rowConfig.isCurrent ?? true,
        };
    }
    if (isRecord(nextConfig.treeConfig)) {
        delete nextConfig.stripe;
    }
    return nextConfig;
});
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readRow(payload) {
    if (!isRecord(payload))
        return undefined;
    return isRecord(payload.row) ? payload.row : undefined;
}
function readActionCode(payload) {
    if (!isRecord(payload))
        return '';
    const code = payload.code;
    if (typeof code === 'string' && code.trim())
        return code.trim();
    const button = payload.button;
    if (isRecord(button) && typeof button.code === 'string' && button.code.trim()) {
        return button.code.trim();
    }
    const tool = payload.tool;
    if (isRecord(tool) && typeof tool.code === 'string' && tool.code.trim()) {
        return tool.code.trim();
    }
    return '';
}
function handleToolbar(action) {
    emit('toolbar', action.code);
}
function emitRowAction(action, row) {
    emit('rowAction', { action, row });
}
function handleCurrentChange(payload) {
    const row = readRow(payload);
    if (!row)
        return;
    emit('rowCurrentChange', {
        row,
        rawEvent: isRecord(payload) ? payload : {},
    });
}
function handleGenericGridEvent(key, payload) {
    const rawEvent = isRecord(payload) ? payload : {};
    const row = readRow(payload);
    emit('gridEvent', {
        key,
        ...(row ? { row } : {}),
        rawEvent,
    });
}
function handleToolbarGridEvent(key, payload) {
    const rawEvent = isRecord(payload) ? payload : {};
    const actionCode = readActionCode(payload);
    emit('gridEvent', {
        key,
        ...(actionCode ? { actionCode } : {}),
        rawEvent,
    });
}
function handleRowDblclick(payload) {
    const row = readRow(payload);
    if (!row)
        return;
    emit('rowDblclick', {
        row,
        rawEvent: isRecord(payload) ? payload : {},
    });
}
function handleCellDblclick(payload) {
    const row = readRow(payload);
    if (!row)
        return;
    const rawEvent = isRecord(payload) ? payload : {};
    emit('cellDblclick', { row, rawEvent });
    emit('rowDblclick', { row, rawEvent });
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
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "lc-grid" },
});
/** @type {__VLS_StyleScopedClasses['lc-grid']} */ ;
if (__VLS_ctx.schema.toolbar?.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lc-grid-toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-grid-toolbar']} */ ;
    for (const [action] of __VLS_vFor((__VLS_ctx.schema.toolbar ?? []))) {
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
        vxeButton;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onClick': {} },
            key: (action.code),
            status: (action.status),
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onClick': {} },
            key: (action.code),
            status: (action.status),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = {
            /** @type {typeof __VLS_5.click} */
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.schema.toolbar?.length))
                    throw 0;
                return (__VLS_ctx.handleToolbar(action));
                // @ts-ignore
                [schema, schema, handleToolbar,];
            },
        };
        const { default: __VLS_7 } = __VLS_3.slots;
        (action.label);
        // @ts-ignore
        [];
        var __VLS_3;
        var __VLS_4;
        // @ts-ignore
        [];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-grid__table-scroll" },
});
/** @type {__VLS_StyleScopedClasses['lc-grid__table-scroll']} */ ;
let __VLS_8;
/** @ts-ignore @type { | typeof __VLS_components.vxeGrid | typeof __VLS_components.VxeGrid | typeof __VLS_components['vxe-grid'] | typeof __VLS_components.vxeGrid | typeof __VLS_components.VxeGrid | typeof __VLS_components['vxe-grid']} */
vxeGrid;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
    ...{ 'onCurrentRowChange': {} },
    ...{ 'onCellClick': {} },
    ...{ 'onCellDblclick': {} },
    ...{ 'onRowDblclick': {} },
    ...{ 'onRadioChange': {} },
    ...{ 'onCheckboxChange': {} },
    ...{ 'onCheckboxAll': {} },
    ...{ 'onSortChange': {} },
    ...{ 'onFilterChange': {} },
    ...{ 'onPageChange': {} },
    ...{ 'onToolbarButtonClick': {} },
    ...{ 'onToolbarToolClick': {} },
    ...{ 'onProxyQuery': {} },
    ...{ 'onProxyDelete': {} },
    ...{ 'onProxySave': {} },
    ...{ 'onFormSubmit': {} },
    ...{ 'onFormReset': {} },
    ...{ 'onZoom': {} },
    ...{ class: "lc-grid__table" },
    ...(__VLS_ctx.gridConfig),
    data: (__VLS_ctx.rows),
    loading: (__VLS_ctx.loading),
}));
const __VLS_10 = __VLS_9({
    ...{ 'onCurrentRowChange': {} },
    ...{ 'onCellClick': {} },
    ...{ 'onCellDblclick': {} },
    ...{ 'onRowDblclick': {} },
    ...{ 'onRadioChange': {} },
    ...{ 'onCheckboxChange': {} },
    ...{ 'onCheckboxAll': {} },
    ...{ 'onSortChange': {} },
    ...{ 'onFilterChange': {} },
    ...{ 'onPageChange': {} },
    ...{ 'onToolbarButtonClick': {} },
    ...{ 'onToolbarToolClick': {} },
    ...{ 'onProxyQuery': {} },
    ...{ 'onProxyDelete': {} },
    ...{ 'onProxySave': {} },
    ...{ 'onFormSubmit': {} },
    ...{ 'onFormReset': {} },
    ...{ 'onZoom': {} },
    ...{ class: "lc-grid__table" },
    ...(__VLS_ctx.gridConfig),
    data: (__VLS_ctx.rows),
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_13;
const __VLS_14 = {
    /** @type {typeof __VLS_13.currentRowChange} */
    onCurrentRowChange: (__VLS_ctx.handleCurrentChange),
};
const __VLS_15 = {
    /** @type {typeof __VLS_13.cellClick} */
    onCellClick: ((payload) => __VLS_ctx.handleGenericGridEvent('cellClick', payload)),
};
const __VLS_16 = {
    /** @type {typeof __VLS_13.cellDblclick} */
    onCellDblclick: (__VLS_ctx.handleCellDblclick),
};
const __VLS_17 = {
    /** @type {typeof __VLS_13.rowDblclick} */
    onRowDblclick: (__VLS_ctx.handleRowDblclick),
};
const __VLS_18 = {
    /** @type {typeof __VLS_13.radioChange} */
    onRadioChange: ((payload) => __VLS_ctx.handleGenericGridEvent('radioChange', payload)),
};
const __VLS_19 = {
    /** @type {typeof __VLS_13.checkboxChange} */
    onCheckboxChange: ((payload) => __VLS_ctx.handleGenericGridEvent('checkboxChange', payload)),
};
const __VLS_20 = {
    /** @type {typeof __VLS_13.checkboxAll} */
    onCheckboxAll: ((payload) => __VLS_ctx.handleGenericGridEvent('checkboxAll', payload)),
};
const __VLS_21 = {
    /** @type {typeof __VLS_13.sortChange} */
    onSortChange: ((payload) => __VLS_ctx.handleGenericGridEvent('sortChange', payload)),
};
const __VLS_22 = {
    /** @type {typeof __VLS_13.filterChange} */
    onFilterChange: ((payload) => __VLS_ctx.handleGenericGridEvent('filterChange', payload)),
};
const __VLS_23 = {
    /** @type {typeof __VLS_13.pageChange} */
    onPageChange: ((payload) => __VLS_ctx.handleGenericGridEvent('pageChange', payload)),
};
const __VLS_24 = {
    /** @type {typeof __VLS_13.toolbarButtonClick} */
    onToolbarButtonClick: ((payload) => __VLS_ctx.handleToolbarGridEvent('toolbarButtonClick', payload)),
};
const __VLS_25 = {
    /** @type {typeof __VLS_13.toolbarToolClick} */
    onToolbarToolClick: ((payload) => __VLS_ctx.handleToolbarGridEvent('toolbarToolClick', payload)),
};
const __VLS_26 = {
    /** @type {typeof __VLS_13.proxyQuery} */
    onProxyQuery: ((payload) => __VLS_ctx.handleGenericGridEvent('proxyQuery', payload)),
};
const __VLS_27 = {
    /** @type {typeof __VLS_13.proxyDelete} */
    onProxyDelete: ((payload) => __VLS_ctx.handleGenericGridEvent('proxyDelete', payload)),
};
const __VLS_28 = {
    /** @type {typeof __VLS_13.proxySave} */
    onProxySave: ((payload) => __VLS_ctx.handleGenericGridEvent('proxySave', payload)),
};
const __VLS_29 = {
    /** @type {typeof __VLS_13.formSubmit} */
    onFormSubmit: ((payload) => __VLS_ctx.handleGenericGridEvent('formSubmit', payload)),
};
const __VLS_30 = {
    /** @type {typeof __VLS_13.formReset} */
    onFormReset: ((payload) => __VLS_ctx.handleGenericGridEvent('formReset', payload)),
};
const __VLS_31 = {
    /** @type {typeof __VLS_13.zoom} */
    onZoom: ((payload) => __VLS_ctx.handleGenericGridEvent('zoom', payload)),
};
/** @type {__VLS_StyleScopedClasses['lc-grid__table']} */ ;
const { default: __VLS_32 } = __VLS_11.slots;
{
    const { actions: __VLS_33 } = __VLS_11.slots;
    const [{ row }] = __VLS_vSlot(__VLS_33);
    if (__VLS_ctx.customRowActions.length) {
        for (const [action] of __VLS_vFor((__VLS_ctx.customRowActions))) {
            let __VLS_34;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
                ...{ 'onClick': {} },
                key: (action.code),
                size: "mini",
                status: (action.status),
                disabled: (action.disabled),
            }));
            const __VLS_36 = __VLS_35({
                ...{ 'onClick': {} },
                key: (action.code),
                size: "mini",
                status: (action.status),
                disabled: (action.disabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_35));
            let __VLS_39;
            const __VLS_40 = {
                /** @type {typeof __VLS_39.click} */
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.customRowActions.length))
                        throw 0;
                    return (__VLS_ctx.emitRowAction(action, row));
                    // @ts-ignore
                    [gridConfig, rows, loading, handleCurrentChange, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleGenericGridEvent, handleCellDblclick, handleRowDblclick, handleToolbarGridEvent, handleToolbarGridEvent, customRowActions, customRowActions, emitRowAction,];
                },
            };
            const { default: __VLS_41 } = __VLS_37.slots;
            if (action.icon) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                    ...{ class: (action.icon) },
                    'aria-hidden': "true",
                });
            }
            (action.label);
            // @ts-ignore
            [];
            var __VLS_37;
            var __VLS_38;
            // @ts-ignore
            [];
        }
    }
    if (!__VLS_ctx.customRowActions.length && __VLS_ctx.schema.rowActions?.edit !== false) {
        let __VLS_42;
        /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
        vxeButton;
        // @ts-ignore
        const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
            ...{ 'onClick': {} },
            size: "mini",
            status: "primary",
        }));
        const __VLS_44 = __VLS_43({
            ...{ 'onClick': {} },
            size: "mini",
            status: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_43));
        let __VLS_47;
        const __VLS_48 = {
            /** @type {typeof __VLS_47.click} */
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.customRowActions.length && __VLS_ctx.schema.rowActions?.edit !== false))
                    throw 0;
                return (__VLS_ctx.$emit('edit', row));
                // @ts-ignore
                [schema, customRowActions, $emit,];
            },
        };
        const { default: __VLS_49 } = __VLS_45.slots;
        (__VLS_ctx.schema.rowActions?.editLabel ?? 'Edit');
        // @ts-ignore
        [schema,];
        var __VLS_45;
        var __VLS_46;
    }
    if (!__VLS_ctx.customRowActions.length && __VLS_ctx.schema.rowActions?.delete !== false) {
        let __VLS_50;
        /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
        vxeButton;
        // @ts-ignore
        const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
            ...{ 'onClick': {} },
            size: "mini",
            status: "danger",
        }));
        const __VLS_52 = __VLS_51({
            ...{ 'onClick': {} },
            size: "mini",
            status: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_51));
        let __VLS_55;
        const __VLS_56 = {
            /** @type {typeof __VLS_55.click} */
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.customRowActions.length && __VLS_ctx.schema.rowActions?.delete !== false))
                    throw 0;
                return (__VLS_ctx.$emit('delete', row));
                // @ts-ignore
                [schema, customRowActions, $emit,];
            },
        };
        const { default: __VLS_57 } = __VLS_53.slots;
        (__VLS_ctx.schema.rowActions?.deleteLabel ?? 'Delete');
        // @ts-ignore
        [schema,];
        var __VLS_53;
        var __VLS_54;
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_11;
var __VLS_12;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
