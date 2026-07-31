/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { cloneDeep } from 'lodash-es';
import DraggableTransitionGroup from './draggable-transition-group.vue';
import SlotItem from './slot-item.vue';
import { $$dropdown, DropdownOption } from '../../utils/dropdown-service';
import MonacoEditor from '../common/monaco-editor/MonacoEditor';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import { useVisualData } from '../../hooks/useVisualData';
import { useModal } from '../../hooks/useModal';
import { generateNanoid } from '../../utils';
import { $$formDesigner, } from '../form-designer/form-designer.service';
import { $$gridDesigner, } from '../grid-designer/grid-designer.service';
import { $$buttonGroupDesigner, } from '../button-group-designer/button-group-designer.service';
import { $$modalDesigner, } from '../modal-designer/modal-designer.service';
defineOptions({
    name: 'SimulatorEditor',
});
const props = withDefaults(defineProps(), {
    allowFormDesign: true,
    workbenchMode: 'page',
});
const { currentPage, setCurrentBlock } = useVisualData();
const { globalProperties } = useGlobalProperties();
const drag = ref(false);
let normalizingOverlayPlacement = false;
const overlayEntries = computed(() => {
    currentPage.value.overlays ??= [];
    return currentPage.value.overlays.map((block, index) => ({
        block,
        parentBlocks: currentPage.value.overlays ?? [],
        index,
    }));
});
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isOverlayBlock = (block) => block.componentKey === 'lowcode-modal' ||
    block.props?.runtimeKind === 'modal' ||
    block.props?.runtimeKind === 'drawer';
const isFillRemainingBlock = (block) => block.layout?.fillRemaining === true || block.props?.layout?.fillRemaining === true;
const getSlotEntries = (block) => {
    const slots = isRecord(block.props?.slots) ? block.props.slots : {};
    return Object.values(slots).filter((slot) => isRecord(slot) && Array.isArray(slot.children));
};
const ensureModalDesignerSlots = (block) => {
    block.props ??= {};
    if (!isRecord(block.props.slots)) {
        block.props.slots = {
            value: '24',
            slot0: {
                key: 'slot0',
                label: '弹框内容',
                span: 24,
                children: [],
            },
        };
        return;
    }
    if (!isRecord(block.props.slots.slot0)) {
        block.props.slots.slot0 = {
            key: 'slot0',
            label: '弹框内容',
            span: 24,
            children: [],
        };
    }
    if (!Array.isArray(block.props.slots.slot0.children)) {
        block.props.slots.slot0.children = [];
    }
    block.props.slots.value ??= '24';
};
const ensureOverlayBlock = (block) => {
    block.props ??= {};
    block.props.overlays ??= [];
    ensureModalDesignerSlots(block);
};
const getBlockTitle = (block) => String(block.props?.title || block.props?.blockId || block.label || '弹框');
function getModalContentBlocks(block) {
    return getSlotEntries(block).flatMap((slot) => slot.children);
}
function countDesignNodes(blocks = []) {
    return blocks.reduce((total, block) => {
        const childCount = getSlotEntries(block).reduce((sum, slot) => sum + countDesignNodes(slot.children), 0);
        const overlayCount = countDesignNodes(block.props?.overlays ?? []);
        return total + 1 + childCount + overlayCount;
    }, 0);
}
function countModalNodes(block) {
    return countDesignNodes(getModalContentBlocks(block)) + countDesignNodes(block.props?.overlays ?? []);
}
function walkDesignBlocks(blocks, callback) {
    blocks.forEach((block) => {
        callback(block);
        getSlotEntries(block).forEach((slot) => walkDesignBlocks(slot.children, callback));
        if (Array.isArray(block.props?.overlays)) {
            walkDesignBlocks(block.props.overlays, callback);
        }
    });
}
function normalizeOverlayBlockList(blocks, ownerOverlays, isOwnerOverlayList = false) {
    let changed = false;
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index];
        if (isOverlayBlock(block)) {
            ensureOverlayBlock(block);
            if (!isOwnerOverlayList) {
                blocks.splice(index, 1);
                ownerOverlays.push(block);
                changed = true;
            }
            getSlotEntries(block).forEach((slot) => {
                changed =
                    normalizeOverlayBlockList(slot.children, block.props.overlays, false) ||
                        changed;
            });
            changed =
                normalizeOverlayBlockList(block.props.overlays, block.props.overlays, true) ||
                    changed;
            continue;
        }
        getSlotEntries(block).forEach((slot) => {
            changed = normalizeOverlayBlockList(slot.children, ownerOverlays, false) || changed;
        });
    }
    return changed;
}
function normalizeOverlayPlacement() {
    if (normalizingOverlayPlacement)
        return;
    normalizingOverlayPlacement = true;
    currentPage.value.overlays ??= [];
    normalizeOverlayBlockList(currentPage.value.blocks, currentPage.value.overlays, false);
    normalizeOverlayBlockList(currentPage.value.overlays, currentPage.value.overlays, true);
    normalizingOverlayPlacement = false;
}
const pageStyle = computed(() => {
    const { bgImage, bgColor } = currentPage.value.config;
    return {
        backgroundColor: bgColor || '#ffffff',
        backgroundImage: bgImage ? `url(${bgImage})` : undefined,
    };
});
watch(() => currentPage.value, normalizeOverlayPlacement, {
    immediate: true,
    deep: true,
    flush: 'post',
});
//递归实现
//@leafId  为你要查找的id，
//@nodes   为原始Json数据
//@path    供递归使用，不要赋值
const findPathByLeafId = (leafId, nodes = [
    ...currentPage.value.blocks,
    ...(currentPage.value.overlays ?? []),
], path = []) => {
    for (let i = 0; i < nodes.length; i++) {
        const tmpPath = path.concat();
        tmpPath.push(nodes[i]);
        if (leafId == nodes[i]._vid) {
            return tmpPath;
        }
        const slots = nodes[i].props?.slots || {};
        const keys = Object.keys(slots);
        for (let j = 0; j < keys.length; j++) {
            const children = slots[keys[j]]?.children;
            if (children) {
                const findResult = findPathByLeafId(leafId, children, tmpPath);
                if (findResult) {
                    return findResult;
                }
            }
        }
        if (Array.isArray(nodes[i].props?.overlays)) {
            const findResult = findPathByLeafId(leafId, nodes[i].props.overlays, tmpPath);
            if (findResult) {
                return findResult;
            }
        }
    }
};
// 给当前点击的组件设置聚焦
const handleSlotsFocus = (block, _vid) => {
    const slots = block.props?.slots || {};
    if (Object.keys(slots).length > 0) {
        Object.keys(slots).forEach((key) => {
            slots[key]?.children?.forEach((item) => {
                item.focusWithChild = false;
                item.focus = item._vid == _vid;
                if (item.focus) {
                    const arr = findPathByLeafId(_vid, currentPage.value.blocks);
                    arr.forEach((n) => (n.focusWithChild = true));
                }
                if (Object.keys(item.props?.slots || {}).length) {
                    handleSlotsFocus(item, _vid);
                }
            });
        });
    }
};
// 选择要操作的组件
const selectComp = (element) => {
    setCurrentBlock(element);
    walkDesignBlocks([...currentPage.value.blocks, ...(currentPage.value.overlays ?? [])], (block) => {
        block.focus = element._vid == block._vid;
        block.focusWithChild = false;
    });
    const path = findPathByLeafId(element._vid) ?? [];
    path.forEach((block) => {
        block.focusWithChild = block._vid !== element._vid;
    });
    element.focus = true;
    element.focusWithChild = false;
};
/**
 * 删除组件
 */
const deleteComp = (block, parentBlocks = currentPage.value.blocks) => {
    const index = parentBlocks.findIndex((item) => item._vid == block._vid);
    if (index != -1) {
        delete globalProperties.$$refs[parentBlocks[index]._vid];
        const delTarget = parentBlocks.splice(index, 1)[0];
        if (delTarget.focus) {
            setCurrentBlock({});
        }
    }
};
const formDesignComponentKeys = new Set(['form', 'lowcode-search-form', 'lowcode-edit-form']);
const gridDesignComponentKeys = new Set(['lowcode-grid', 'grid', 'table', 'vxe-grid']);
const buttonGroupDesignComponentKeys = new Set([
    'lowcode-button-group',
    'button-group',
    'buttonGroup',
]);
const subFormDesignComponentKeys = new Set(['sub-form', 'lc-sub-form']);
const modalDesignComponentKeys = new Set(['lowcode-modal']);
const isFormDesignBlock = (block) => formDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.fields);
const isGridDesignBlock = (block) => gridDesignComponentKeys.has(block.componentKey) ||
    (Array.isArray(block.props?.columns) && !isFormDesignBlock(block));
const isButtonGroupDesignBlock = (block) => buttonGroupDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.buttons);
const isSubFormDesignBlock = (block) => subFormDesignComponentKeys.has(block.componentKey) ||
    block.props?.__lowcodeComponent === 'lc-sub-form';
const isModalDesignBlock = (block) => modalDesignComponentKeys.has(block.componentKey) ||
    block.props?.runtimeKind === 'modal';
const syncFormDesignToPageBlock = (block, result) => {
    block.props.fields = cloneDeep(result.fields);
    delete block.props.columns;
    block.props.formDesignerModel = cloneDeep(result.designerModel);
    block.props.formDesignerUpdatedAt = Date.now();
    selectComp(block);
};
const syncGridDesignToPageBlock = (block, result) => {
    Object.assign(block.props, cloneDeep(result.business));
    block.props.columns = cloneDeep(result.columns);
    block.props.gridOptions = cloneDeep(result.gridOptions);
    block.props.gridEvents = cloneDeep(result.gridEvents);
    block.props.gridDesignerUpdatedAt = Date.now();
    selectComp(block);
};
const syncButtonGroupDesignToPageBlock = (block, result) => {
    Object.assign(block.props, cloneDeep(result.business));
    block.props.buttons = cloneDeep(result.buttons);
    block.props.buttonGroupDesignerUpdatedAt = Date.now();
    selectComp(block);
};
const syncSubFormDesignToFieldBlock = (block, result) => {
    block.props.__lowcodeComponent = 'lc-sub-form';
    block.props.fields = cloneDeep(result.fields);
    block.props.subFormDesignerModel = cloneDeep(result.designerModel);
    block.props.subFormDesignerUpdatedAt = Date.now();
    selectComp(block);
};
const syncModalDesignToPageBlock = (block, result) => {
    ensureOverlayBlock(block);
    block.props.slots.slot0.children = cloneDeep(result.blocks);
    block.props.overlays = cloneDeep(result.overlays);
    block.props.modalDesignerModel = cloneDeep(result.designerModel);
    block.props.modalDesignerUpdatedAt = Date.now();
    selectComp(block);
};
const openFormDesigner = async (block) => {
    selectComp(block);
    const isSearchForm = block.componentKey === 'lowcode-search-form';
    const result = await $$formDesigner({
        title: `${block.label || '表单'}设计`,
        mode: isSearchForm ? 'search' : 'edit',
        fields: Array.isArray(block.props?.fields) ? block.props.fields : [],
        designerModel: block.props?.formDesignerModel || null,
    });
    syncFormDesignToPageBlock(block, result);
};
const openGridDesigner = async (block) => {
    selectComp(block);
    const result = await $$gridDesigner({
        title: `${block.label || '表格'}设计`,
        business: {
            blockId: block.props?.blockId,
            title: block.props?.title,
            sourceKey: block.props?.sourceKey,
            serviceName: block.props?.serviceName,
            serviceMethod: block.props?.serviceMethod,
            saveMethod: block.props?.saveMethod,
            deleteMethod: block.props?.deleteMethod,
            postDataJson: block.props?.postDataJson,
            showRowActions: block.props?.showRowActions,
        },
        columns: Array.isArray(block.props?.columns) ? block.props.columns : [],
        gridOptions: typeof block.props?.gridOptions === 'object' && block.props?.gridOptions !== null
            ? block.props.gridOptions
            : {},
        gridEvents: Array.isArray(block.props?.gridEvents) ? block.props.gridEvents : [],
    });
    syncGridDesignToPageBlock(block, result);
};
const openButtonGroupDesigner = async (block) => {
    selectComp(block);
    const result = await $$buttonGroupDesigner({
        title: `${block.label || '按钮组'}设计`,
        business: {
            blockId: block.props?.blockId,
            title: block.props?.title,
            description: block.props?.description,
            align: block.props?.align,
            gap: block.props?.gap,
        },
        buttons: Array.isArray(block.props?.buttons) ? block.props.buttons : [],
    });
    syncButtonGroupDesignToPageBlock(block, result);
};
const openSubFormDesigner = async (block) => {
    selectComp(block);
    const result = await $$formDesigner({
        title: `${block.props?.label || block.label || '子表单'}设计`,
        mode: 'edit',
        fields: Array.isArray(block.props?.fields) ? block.props.fields : [],
        designerModel: block.props?.subFormDesignerModel || null,
    });
    syncSubFormDesignToFieldBlock(block, result);
};
const openModalDesigner = async (block) => {
    selectComp(block);
    ensureOverlayBlock(block);
    const result = await $$modalDesigner({
        title: `${getBlockTitle(block)}设计`,
        blocks: getModalContentBlocks(block),
        overlays: Array.isArray(block.props?.overlays) ? block.props.overlays : [],
    });
    syncModalDesignToPageBlock(block, result);
};
const onContextmenuBlock = (e, block, parentBlocks = currentPage.value.blocks) => {
    $$dropdown({
        reference: e,
        content: () => (<>
          {props.allowFormDesign && isModalDesignBlock(block) && (<DropdownOption label="进入设计" icon="ri-edit-line" {...{
                onClick: () => void openModalDesigner(block),
            }}/>)}
          {props.allowFormDesign &&
                (isFormDesignBlock(block) ||
                    isGridDesignBlock(block) ||
                    isButtonGroupDesignBlock(block)) && (<DropdownOption label="进入设计" icon="ri-edit-line" {...{
                onClick: () => void (isButtonGroupDesignBlock(block)
                    ? openButtonGroupDesigner(block)
                    : isGridDesignBlock(block)
                        ? openGridDesigner(block)
                        : openFormDesigner(block)),
            }}/>)}
          {isSubFormDesignBlock(block) && (<DropdownOption label="进入设计" icon="ri-edit-line" {...{
                onClick: () => void openSubFormDesigner(block),
            }}/>)}
          <DropdownOption label="复制节点" icon="ri-file-copy-line" {...{
            onClick: () => {
                const index = parentBlocks.findIndex((item) => item._vid == block._vid);
                if (index != -1) {
                    const setBlockVid = (block) => {
                        block._vid = `vid_${generateNanoid()}`;
                        block.focus = false;
                        const slots = block?.props?.slots || {};
                        const slotKeys = Object.keys(slots);
                        if (slotKeys.length) {
                            slotKeys.forEach((slotKey) => {
                                slots[slotKey]?.children?.forEach((child) => setBlockVid(child));
                            });
                        }
                        if (Array.isArray(block.props?.overlays)) {
                            block.props.overlays.forEach((child) => setBlockVid(child));
                        }
                    };
                    const blockCopy = cloneDeep(parentBlocks[index]);
                    setBlockVid(blockCopy);
                    parentBlocks.splice(index + 1, 0, blockCopy);
                }
            },
        }}/>
          <DropdownOption label="查看节点" icon="ri-eye-line" {...{
            onClick: () => useModal({
                title: '节点信息',
                footer: null,
                props: {
                    width: 600,
                },
                content: () => (<MonacoEditor code={JSON.stringify(block)} layout={{ width: 530, height: 600 }} vid={block._vid}/>),
            }),
        }}/>
          <DropdownOption label="删除节点" icon="ri-delete-bin-line" {...{
            onClick: () => deleteComp(block, parentBlocks),
        }}/>
        </>),
    });
};
const __VLS_defaults = {
    allowFormDesign: true,
    workbenchMode: 'page',
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['simulator-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['simulator-container']} */ ;
/** @type {__VLS_StyleScopedClasses['simulator-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['simulator-editor-content']} */ ;
/** @type {__VLS_StyleScopedClasses['focus']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "simulator-container" },
    ...{ class: ({ 'is-form-workbench': __VLS_ctx.workbenchMode === 'form' }) },
});
/** @type {__VLS_StyleScopedClasses['simulator-container']} */ ;
/** @type {__VLS_StyleScopedClasses['is-form-workbench']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "simulator-editor" },
});
/** @type {__VLS_StyleScopedClasses['simulator-editor']} */ ;
if (__VLS_ctx.overlayEntries.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "simulator-overlay-shelf" },
    });
    /** @type {__VLS_StyleScopedClasses['simulator-overlay-shelf']} */ ;
    for (const [entry] of __VLS_vFor((__VLS_ctx.overlayEntries))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onContextmenu: (...[$event]) => {
                    if (!(__VLS_ctx.overlayEntries.length))
                        throw 0;
                    return (__VLS_ctx.onContextmenuBlock($event, entry.block, entry.parentBlocks));
                    // @ts-ignore
                    [workbenchMode, overlayEntries, overlayEntries, onContextmenuBlock,];
                } },
            ...{ onMousedown: (...[$event]) => {
                    if (!(__VLS_ctx.overlayEntries.length))
                        throw 0;
                    return (__VLS_ctx.selectComp(entry.block));
                    // @ts-ignore
                    [selectComp,];
                } },
            ...{ onDblclick: (...[$event]) => {
                    if (!(__VLS_ctx.overlayEntries.length))
                        throw 0;
                    return (__VLS_ctx.openModalDesigner(entry.block));
                    // @ts-ignore
                    [openModalDesigner,];
                } },
            key: (entry.block._vid),
            ...{ class: "simulator-overlay-card" },
            ...{ class: ({ focus: entry.block.focus }) },
        });
        /** @type {__VLS_StyleScopedClasses['simulator-overlay-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['focus']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "simulator-overlay-card__tag" },
        });
        /** @type {__VLS_StyleScopedClasses['simulator-overlay-card__tag']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.getBlockTitle(entry.block));
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (entry.block.props?.blockId || entry.block._vid);
        (__VLS_ctx.countModalNodes(entry.block));
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ class: "ri-edit-line" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['ri-edit-line']} */ ;
        // @ts-ignore
        [getBlockTitle, countModalNodes,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "simulator-editor-content" },
    ...{ style: (__VLS_ctx.pageStyle) },
});
/** @type {__VLS_StyleScopedClasses['simulator-editor-content']} */ ;
const __VLS_0 = DraggableTransitionGroup || DraggableTransitionGroup;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    drag: (__VLS_ctx.drag),
    modelValue: (__VLS_ctx.currentPage.blocks),
    ...{ class: "simulator-drop-zone" },
    draggable: ".item-drag",
}));
const __VLS_2 = __VLS_1({
    drag: (__VLS_ctx.drag),
    modelValue: (__VLS_ctx.currentPage.blocks),
    ...{ class: "simulator-drop-zone" },
    draggable: ".item-drag",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['simulator-drop-zone']} */ ;
const { default: __VLS_5 } = __VLS_3.slots;
{
    const { item: __VLS_6 } = __VLS_3.slots;
    const [{ element: outElement }] = __VLS_vSlot(__VLS_6);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onContextmenu: (...[$event]) => {
                return (__VLS_ctx.onContextmenuBlock($event, outElement));
                // @ts-ignore
                [onContextmenuBlock, pageStyle, drag, currentPage,];
            } },
        ...{ onMousedown: (...[$event]) => {
                return (__VLS_ctx.selectComp(outElement));
                // @ts-ignore
                [selectComp,];
            } },
        ...{ class: "list-group-item" },
        'data-label': (outElement.label),
        ...{ class: ({
                focus: outElement.focus,
                focusWithChild: outElement.focusWithChild,
                drag: __VLS_ctx.drag,
                fillRemaining: __VLS_ctx.isFillRemainingBlock(outElement),
                ['has-slot']: !!Object.keys(outElement.props.slots || {}).length,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['list-group-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['focus']} */ ;
    /** @type {__VLS_StyleScopedClasses['focusWithChild']} */ ;
    /** @type {__VLS_StyleScopedClasses['drag']} */ ;
    /** @type {__VLS_StyleScopedClasses['fillRemaining']} */ ;
    /** @type {__VLS_StyleScopedClasses['has-slot']} */ ;
    let __VLS_7;
    /** @ts-ignore @type { | typeof __VLS_components.compRender | typeof __VLS_components.CompRender | typeof __VLS_components['comp-render'] | typeof __VLS_components.compRender | typeof __VLS_components.CompRender | typeof __VLS_components['comp-render']} */
    compRender;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        key: (outElement._vid),
        element: (outElement),
        ...{ style: ({
                pointerEvents: Object.keys(outElement.props?.slots || {}).length
                    ? 'auto'
                    : 'none',
            }) },
    }));
    const __VLS_9 = __VLS_8({
        key: (outElement._vid),
        element: (outElement),
        ...{ style: ({
                pointerEvents: Object.keys(outElement.props?.slots || {}).length
                    ? 'auto'
                    : 'none',
            }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    const { default: __VLS_12 } = __VLS_10.slots;
    for (const [value, slotKey] of __VLS_vFor((outElement.props?.slots))) {
        {
            const { [__VLS_tryAsConstant(slotKey)]: __VLS_13 } = __VLS_10.slots;
            const __VLS_14 = SlotItem;
            // @ts-ignore
            const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
                children: (value.children),
                drag: (__VLS_ctx.drag),
                slotKey: (slotKey),
                onContextmenuBlock: (__VLS_ctx.onContextmenuBlock),
                selectComp: (__VLS_ctx.selectComp),
                deleteComp: (__VLS_ctx.deleteComp),
            }));
            const __VLS_16 = __VLS_15({
                children: (value.children),
                drag: (__VLS_ctx.drag),
                slotKey: (slotKey),
                onContextmenuBlock: (__VLS_ctx.onContextmenuBlock),
                selectComp: (__VLS_ctx.selectComp),
                deleteComp: (__VLS_ctx.deleteComp),
            }, ...__VLS_functionalComponentArgsRest(__VLS_15));
            // @ts-ignore
            [onContextmenuBlock, selectComp, drag, drag, isFillRemainingBlock, deleteComp,];
        }
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    var __VLS_10;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
    props: {},
});
export default {};
