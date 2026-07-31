/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { cloneDeep } from 'lodash-es';
import { ElMessage, ElMessageBox } from '../../../common/designer-ui';
import { Aim, CopyDocument, Delete, Document, Edit, FolderOpened, MoreFilled, Rank, } from '../../../common/remix-icons';
import { useGlobalProperties } from '../../../../../hooks/useGlobalProperties';
import { useVisualData } from '../../../../hooks/useVisualData';
import { generateNanoid } from '../../../../utils';
defineOptions({
    name: 'LayerBlockList',
});
const props = withDefaults(defineProps(), {
    depth: 0,
    readonly: false,
    overlayList: false,
});
const emit = defineEmits();
const { currentPage, currentBlock, setCurrentBlock } = useVisualData();
const { globalProperties } = useGlobalProperties();
const blocksModel = computed({
    get: () => props.blocks,
    set: (blocks) => emit('update:blocks', blocks),
});
const dragGroup = computed(() => props.readonly
    ? { name: 'layer-blocks', pull: false, put: false }
    : { name: 'layer-blocks' });
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readString(value, fallback = '') {
    if (typeof value === 'string')
        return value.trim() || fallback;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return fallback;
}
function getBlockName(block) {
    return (readString(block.props?.__outlineName) ||
        readString(block.props?.title) ||
        readString(block.props?.blockId) ||
        readString(block.label) ||
        readString(block.componentKey, '未命名节点'));
}
function getSlotGroups(block) {
    const slots = isRecord(block.props?.slots) ? block.props.slots : {};
    return Object.entries(slots)
        .filter(([, slot]) => isRecord(slot))
        .map(([key, slot]) => {
        const slotConfig = slot;
        slotConfig.children ??= [];
        const label = readString(slotConfig.label) ||
            readString(slotConfig.title) ||
            (slotConfig.span ? `列 ${slotConfig.span}` : '') ||
            `插槽 ${key}`;
        return {
            key,
            label,
            slot: slotConfig,
        };
    });
}
function getOverlayBlocks(block) {
    return Array.isArray(block.props?.overlays)
        ? block.props.overlays
        : [];
}
function isOverlayBlock(block) {
    return (block.componentKey === 'lowcode-modal' ||
        block.props?.runtimeKind === 'modal' ||
        block.props?.runtimeKind === 'drawer');
}
function getFormDesignerBlocks(block) {
    const model = block.props?.formDesignerModel;
    if (!isRecord(model) || !isRecord(model.pages))
        return [];
    const page = model.pages['/'];
    return isRecord(page) && Array.isArray(page.blocks)
        ? page.blocks
        : [];
}
function walkBlocks(blocks, callback) {
    blocks.forEach((block) => {
        callback(block);
        getSlotGroups(block).forEach((group) => walkBlocks(group.slot.children, callback));
        walkBlocks(getOverlayBlocks(block), callback);
    });
}
function findBlockPath(targetVid, blocks = [
    ...currentPage.value.blocks,
    ...(currentPage.value.overlays ?? []),
], path = []) {
    for (const block of blocks) {
        const nextPath = [...path, block];
        if (block._vid === targetVid)
            return nextPath;
        for (const group of getSlotGroups(block)) {
            const childPath = findBlockPath(targetVid, group.slot.children, nextPath);
            if (childPath)
                return childPath;
        }
        const overlayPath = findBlockPath(targetVid, getOverlayBlocks(block), nextPath);
        if (overlayPath)
            return overlayPath;
    }
    return null;
}
function selectBlock(block) {
    if (props.readonly)
        return;
    walkBlocks([...currentPage.value.blocks, ...(currentPage.value.overlays ?? [])], (item) => {
        item.focus = item._vid === block._vid;
        item.focusWithChild = false;
    });
    const path = findBlockPath(block._vid) ?? [];
    path.forEach((item) => {
        item.focusWithChild = item._vid !== block._vid;
    });
    block.focus = true;
    block.focusWithChild = false;
    setCurrentBlock(block);
}
function isActive(block) {
    return currentBlock.value?._vid === block._vid || block.focus;
}
function removeRefs(block) {
    delete globalProperties.$$refs?.[block._vid];
    getSlotGroups(block).forEach((group) => group.slot.children.forEach(removeRefs));
    getOverlayBlocks(block).forEach(removeRefs);
}
function containsBlock(root, targetVid) {
    if (!targetVid)
        return false;
    let matched = root._vid === targetVid;
    walkBlocks([root], (block) => {
        if (block._vid === targetVid) {
            matched = true;
        }
    });
    return matched;
}
function deleteBlock(block) {
    if (props.readonly)
        return;
    const index = blocksModel.value.findIndex((item) => item._vid === block._vid);
    if (index === -1)
        return;
    const [removed] = blocksModel.value.splice(index, 1);
    removeRefs(removed);
    if (containsBlock(removed, currentBlock.value?._vid)) {
        setCurrentBlock({});
    }
}
function resetBlockIds(block) {
    block._vid = `vid_${generateNanoid()}`;
    block.focus = false;
    block.focusWithChild = false;
    getSlotGroups(block).forEach((group) => group.slot.children.forEach(resetBlockIds));
    getOverlayBlocks(block).forEach(resetBlockIds);
    getFormDesignerBlocks(block).forEach(resetBlockIds);
}
function copyBlock(block) {
    if (props.readonly)
        return;
    const index = blocksModel.value.findIndex((item) => item._vid === block._vid);
    if (index === -1)
        return;
    const copy = cloneDeep(block);
    resetBlockIds(copy);
    copy.props ??= {};
    copy.props.__outlineName = `${getBlockName(block)} 副本`;
    blocksModel.value.splice(index + 1, 0, copy);
    selectBlock(copy);
}
async function renameBlock(block) {
    if (props.readonly)
        return;
    try {
        const result = await ElMessageBox.prompt('节点名称', '重命名节点', {
            inputValue: getBlockName(block),
            inputPattern: /\S+/,
            inputErrorMessage: '请输入节点名称',
            confirmButtonText: '确定',
            cancelButtonText: '取消',
        });
        const nextName = readString(result.value);
        if (!nextName)
            return;
        block.props ??= {};
        block.props.__outlineName = nextName;
    }
    catch {
        // cancel
    }
}
function closeLayerActionMenu(event) {
    const details = event.currentTarget?.closest('details');
    if (details instanceof HTMLDetailsElement) {
        details.open = false;
    }
}
function runLayerAction(event, action) {
    closeLayerActionMenu(event);
    void action();
}
function isDescendantList(block, list) {
    let matched = false;
    getSlotGroups(block).forEach((group) => {
        if (group.slot.children === list) {
            matched = true;
        }
        group.slot.children.forEach((child) => {
            if (isDescendantList(child, list)) {
                matched = true;
            }
        });
    });
    if (getOverlayBlocks(block) === list) {
        matched = true;
    }
    getOverlayBlocks(block).forEach((child) => {
        if (isDescendantList(child, list)) {
            matched = true;
        }
    });
    return matched;
}
function isOverlayBlockList(list) {
    if (props.overlayList && props.blocks === list) {
        return true;
    }
    if (currentPage.value.overlays === list) {
        return true;
    }
    let matched = false;
    walkBlocks([...currentPage.value.blocks, ...(currentPage.value.overlays ?? [])], (block) => {
        if (getOverlayBlocks(block) === list) {
            matched = true;
        }
    });
    return matched;
}
function canMove(event) {
    if (props.readonly)
        return false;
    const dragged = event.draggedContext?.element;
    const targetList = event.relatedContext?.list;
    if (!dragged || !targetList)
        return true;
    const targetIsOverlayList = isOverlayBlockList(targetList);
    const draggedIsOverlay = isOverlayBlock(dragged);
    if (targetIsOverlayList !== draggedIsOverlay) {
        ElMessage.warning(targetIsOverlayList
            ? '弹层列表只能放弹框或抽屉。'
            : '弹框和抽屉请放在弹层列表中。');
        return false;
    }
    const allowed = !isDescendantList(dragged, targetList);
    if (!allowed) {
        ElMessage.warning('不能移动到自身内部。');
    }
    return allowed;
}
const __VLS_defaults = {
    depth: 0,
    readonly: false,
    overlayList: false,
};
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
/** @type {__VLS_StyleScopedClasses['layer-row__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-row--block']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-row__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-row__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-actions-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-actions-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-actions-menu']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.draggable | typeof __VLS_components.Draggable | typeof __VLS_components.draggable | typeof __VLS_components.Draggable} */
draggable;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.blocksModel),
    itemKey: "_vid",
    ...{ class: "layer-list" },
    ...{ class: ({
            'layer-list--nested': __VLS_ctx.depth > 0,
            'layer-list--readonly': __VLS_ctx.readonly,
        }) },
    group: (__VLS_ctx.dragGroup),
    sort: (!__VLS_ctx.readonly),
    disabled: (__VLS_ctx.readonly),
    move: (__VLS_ctx.canMove),
    handle: ".layer-drag-handle",
    ghostClass: "layer-ghost",
    animation: (160),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.blocksModel),
    itemKey: "_vid",
    ...{ class: "layer-list" },
    ...{ class: ({
            'layer-list--nested': __VLS_ctx.depth > 0,
            'layer-list--readonly': __VLS_ctx.readonly,
        }) },
    group: (__VLS_ctx.dragGroup),
    sort: (!__VLS_ctx.readonly),
    disabled: (__VLS_ctx.readonly),
    move: (__VLS_ctx.canMove),
    handle: ".layer-drag-handle",
    ghostClass: "layer-ghost",
    animation: (160),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
/** @type {__VLS_StyleScopedClasses['layer-list']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-list--nested']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-list--readonly']} */ ;
const { default: __VLS_6 } = __VLS_3.slots;
{
    const { item: __VLS_7 } = __VLS_3.slots;
    const [{ element: block }] = __VLS_vSlot(__VLS_7);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "layer-item" },
    });
    /** @type {__VLS_StyleScopedClasses['layer-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.selectBlock(block));
                // @ts-ignore
                [blocksModel, depth, readonly, readonly, readonly, dragGroup, canMove, selectBlock,];
            } },
        ...{ onDblclick: (...[$event]) => {
                return (__VLS_ctx.renameBlock(block));
                // @ts-ignore
                [renameBlock,];
            } },
        ...{ class: "layer-row layer-row--block" },
        ...{ class: ({
                'is-active': __VLS_ctx.isActive(block),
                'is-readonly': __VLS_ctx.readonly,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['layer-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['layer-row--block']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-active']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-readonly']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "layer-drag-handle layer-icon" },
        ...{ class: ({ 'is-disabled': __VLS_ctx.readonly }) },
    });
    /** @type {__VLS_StyleScopedClasses['layer-drag-handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['layer-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
    let __VLS_8;
    /** @ts-ignore @type { | typeof __VLS_components.Rank} */
    Rank;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({}));
    const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "layer-row__text" },
    });
    /** @type {__VLS_StyleScopedClasses['layer-row__text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.getBlockName(block));
    __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
    (block.componentKey);
    if (!__VLS_ctx.readonly) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onClick: () => { } },
            ...{ class: "layer-row__actions" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-row__actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
            ...{ class: "layer-actions-menu" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-actions-menu']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({
            ...{ class: "layer-actions-trigger" },
            'aria-label': (`${__VLS_ctx.getBlockName(block)} 操作`),
        });
        /** @type {__VLS_StyleScopedClasses['layer-actions-trigger']} */ ;
        let __VLS_13;
        /** @ts-ignore @type { | typeof __VLS_components.MoreFilled} */
        MoreFilled;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({}));
        const __VLS_15 = __VLS_14({}, ...__VLS_functionalComponentArgsRest(__VLS_14));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "layer-actions-popover" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-actions-popover']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.readonly))
                        throw 0;
                    return (__VLS_ctx.runLayerAction($event, () => __VLS_ctx.selectBlock(block)));
                    // @ts-ignore
                    [readonly, readonly, readonly, selectBlock, isActive, getBlockName, getBlockName, runLayerAction,];
                } },
            ...{ class: "layer-action-item" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['layer-action-item']} */ ;
        let __VLS_18;
        /** @ts-ignore @type { | typeof __VLS_components.Aim} */
        Aim;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({}));
        const __VLS_20 = __VLS_19({}, ...__VLS_functionalComponentArgsRest(__VLS_19));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.readonly))
                        throw 0;
                    return (__VLS_ctx.runLayerAction($event, () => __VLS_ctx.renameBlock(block)));
                    // @ts-ignore
                    [renameBlock, runLayerAction,];
                } },
            ...{ class: "layer-action-item" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['layer-action-item']} */ ;
        let __VLS_23;
        /** @ts-ignore @type { | typeof __VLS_components.Edit} */
        Edit;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({}));
        const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.readonly))
                        throw 0;
                    return (__VLS_ctx.runLayerAction($event, () => __VLS_ctx.copyBlock(block)));
                    // @ts-ignore
                    [runLayerAction, copyBlock,];
                } },
            ...{ class: "layer-action-item" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['layer-action-item']} */ ;
        let __VLS_28;
        /** @ts-ignore @type { | typeof __VLS_components.CopyDocument} */
        CopyDocument;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({}));
        const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.readonly))
                        throw 0;
                    return (__VLS_ctx.runLayerAction($event, () => __VLS_ctx.deleteBlock(block)));
                    // @ts-ignore
                    [runLayerAction, deleteBlock,];
                } },
            ...{ class: "layer-action-item is-danger" },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['layer-action-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-danger']} */ ;
        let __VLS_33;
        /** @ts-ignore @type { | typeof __VLS_components.Delete} */
        Delete;
        // @ts-ignore
        const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({}));
        const __VLS_35 = __VLS_34({}, ...__VLS_functionalComponentArgsRest(__VLS_34));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
    if (__VLS_ctx.getSlotGroups(block).length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "layer-children" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-children']} */ ;
        for (const [group] of __VLS_vFor((__VLS_ctx.getSlotGroups(block)))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                key: (`${block._vid}-${group.key}`),
                ...{ class: "layer-group" },
            });
            /** @type {__VLS_StyleScopedClasses['layer-group']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "layer-row layer-row--slot" },
            });
            /** @type {__VLS_StyleScopedClasses['layer-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['layer-row--slot']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "layer-icon" },
            });
            /** @type {__VLS_StyleScopedClasses['layer-icon']} */ ;
            let __VLS_38;
            /** @ts-ignore @type { | typeof __VLS_components.FolderOpened} */
            FolderOpened;
            // @ts-ignore
            const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({}));
            const __VLS_40 = __VLS_39({}, ...__VLS_functionalComponentArgsRest(__VLS_39));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "layer-row__text" },
            });
            /** @type {__VLS_StyleScopedClasses['layer-row__text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (group.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
            (group.slot.children.length);
            let __VLS_43;
            /** @ts-ignore @type { | typeof __VLS_components.LayerBlockList} */
            LayerBlockList;
            // @ts-ignore
            const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
                blocks: (group.slot.children),
                depth: (__VLS_ctx.depth + 1),
            }));
            const __VLS_45 = __VLS_44({
                blocks: (group.slot.children),
                depth: (__VLS_ctx.depth + 1),
            }, ...__VLS_functionalComponentArgsRest(__VLS_44));
            // @ts-ignore
            [depth, getSlotGroups, getSlotGroups,];
        }
    }
    if (__VLS_ctx.getOverlayBlocks(block).length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "layer-children" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-children']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "layer-group" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "layer-row layer-row--slot" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['layer-row--slot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "layer-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-icon']} */ ;
        let __VLS_48;
        /** @ts-ignore @type { | typeof __VLS_components.FolderOpened} */
        FolderOpened;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({}));
        const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "layer-row__text" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-row__text']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (__VLS_ctx.getOverlayBlocks(block).length);
        let __VLS_53;
        /** @ts-ignore @type { | typeof __VLS_components.LayerBlockList} */
        LayerBlockList;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
            blocks: (block.props.overlays),
            depth: (__VLS_ctx.depth + 1),
            overlayList: true,
        }));
        const __VLS_55 = __VLS_54({
            blocks: (block.props.overlays),
            depth: (__VLS_ctx.depth + 1),
            overlayList: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    }
    if (__VLS_ctx.getFormDesignerBlocks(block).length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "layer-children" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-children']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "layer-group layer-group--readonly" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-group']} */ ;
        /** @type {__VLS_StyleScopedClasses['layer-group--readonly']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "layer-row layer-row--slot" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['layer-row--slot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "layer-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-icon']} */ ;
        let __VLS_58;
        /** @ts-ignore @type { | typeof __VLS_components.Document} */
        Document;
        // @ts-ignore
        const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({}));
        const __VLS_60 = __VLS_59({}, ...__VLS_functionalComponentArgsRest(__VLS_59));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "layer-row__text" },
        });
        /** @type {__VLS_StyleScopedClasses['layer-row__text']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (__VLS_ctx.getFormDesignerBlocks(block).length);
        let __VLS_63;
        /** @ts-ignore @type { | typeof __VLS_components.LayerBlockList} */
        LayerBlockList;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent1(__VLS_63, new __VLS_63({
            blocks: (__VLS_ctx.getFormDesignerBlocks(block)),
            depth: (__VLS_ctx.depth + 1),
            readonly: true,
        }));
        const __VLS_65 = __VLS_64({
            blocks: (__VLS_ctx.getFormDesignerBlocks(block)),
            depth: (__VLS_ctx.depth + 1),
            readonly: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    }
    // @ts-ignore
    [depth, depth, getOverlayBlocks, getOverlayBlocks, getFormDesignerBlocks, getFormDesignerBlocks, getFormDesignerBlocks,];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
