<template>
  <div class="simulator-container" :class="{ 'is-form-workbench': workbenchMode === 'form' }">
    <div class="simulator-editor">
      <div v-if="overlayEntries.length" class="simulator-overlay-shelf">
        <div
          v-for="entry in overlayEntries"
          :key="entry.block._vid"
          class="simulator-overlay-card"
          :class="{ focus: entry.block.focus }"
          @contextmenu.stop.prevent="onContextmenuBlock($event, entry.block, entry.parentBlocks)"
          @mousedown.stop="selectComp(entry.block)"
          @dblclick.stop="openModalDesigner(entry.block)"
        >
          <span class="simulator-overlay-card__tag">弹框</span>
          <strong>{{ getBlockTitle(entry.block) }}</strong>
          <small>{{ entry.block.props?.blockId || entry.block._vid }} · {{ countModalNodes(entry.block) }} 个节点</small>
          <i class="ri-edit-line" aria-hidden="true" />
        </div>
      </div>

      <div class="simulator-editor-content" :style="pageStyle">
        <DraggableTransitionGroup
          v-model:drag="drag"
          v-model="currentPage.blocks"
          class="simulator-drop-zone"
          draggable=".item-drag"
        >
          <template #item="{ element: outElement }">
            <div
              class="list-group-item"
              :data-label="outElement.label"
              :class="{
                focus: outElement.focus,
                focusWithChild: outElement.focusWithChild,
                drag,
                fillRemaining: isFillRemainingBlock(outElement),
                ['has-slot']: !!Object.keys(outElement.props.slots || {}).length,
              }"
              @contextmenu.stop.prevent="onContextmenuBlock($event, outElement)"
              @mousedown="selectComp(outElement)"
            >
              <comp-render
                :key="outElement._vid"
                :element="outElement"
                :style="{
                  pointerEvents: Object.keys(outElement.props?.slots || {}).length
                    ? 'auto'
                    : 'none',
                }"
              >
                <template
                  v-for="(value, slotKey) in outElement.props?.slots"
                  :key="slotKey"
                  #[slotKey]
                >
                  <SlotItem
                    v-model:children="value.children"
                    v-model:drag="drag"
                    :slot-key="slotKey"
                    :on-contextmenu-block="onContextmenuBlock"
                    :select-comp="selectComp"
                    :delete-comp="deleteComp"
                  />
                </template>
              </comp-render>
            </div>
          </template>
        </DraggableTransitionGroup>
      </div>
    </div>
  </div>
</template>

<script lang="tsx" setup>
  import { computed, provide, ref, watch } from 'vue';
  import { cloneDeep } from 'lodash-es';
  import DraggableTransitionGroup from './draggable-transition-group.vue';
  import CompRender from './comp-render';
  import SlotItem from './slot-item.vue';
  import type { VisualEditorBlockData } from '../../visual-editor.utils';
  import {VxeUI} from 'vxe-pc-ui';
  import MonacoEditor from '../common/monaco-editor/MonacoEditor';
  import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
  import { useLowCodeHost } from '../../../core/host';
  import type { LowCodePageRecord } from '../../../types/lowcode';
  import { useVisualData } from '../../hooks/useVisualData';
  import { useModal } from '../../hooks/useModal';
  import { generateNanoid } from '../../utils';
  import {
    $$formDesigner,
    createLowCodeFormSchemaFromDesignerResult,
    type FormDesignerResult,
  } from '../form-designer/form-designer.service';
  import {
    $$gridDesigner,
    type GridDesignerResult,
  } from '../grid-designer/grid-designer.service';
  import {
    $$buttonGroupDesigner,
    type ButtonGroupDesignerResult,
  } from '../button-group-designer/button-group-designer.service';
  import { convertVisualEditorToLowCode } from '../../../lowcode/visual-converters';
  import type { LowCodeContextSource } from '../../../runtime/lowcode-context';
  import { lowCodeScriptContextProviderKey } from '../../../runtime/script-context-provider';
  import { createDesignerScriptContextSource } from '../../designer-script-context';
  import { collectLowCodePageDataSources } from '../../../runtime/page-data-sources';
  import {
    $$modalDesigner,
    type ModalDesignerResult,
  } from '../modal-designer/modal-designer.service';

  defineOptions({
    name: 'SimulatorEditor',
  });

  const props = withDefaults(
    defineProps<{
      allowFormDesign?: boolean;
      workbenchMode?: 'page' | 'form';
      pageRecord?: LowCodePageRecord | null;
    }>(),
    {
      allowFormDesign: true,
      workbenchMode: 'page',
    },
  );

  const visualData = useVisualData();
  const { currentPage, setCurrentBlock } = visualData;
  const host = useLowCodeHost();
  const readString = (value: unknown, fallback = '') =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;

  const { globalProperties } = useGlobalProperties();

  const drag = ref(false);
  let normalizingOverlayPlacement = false;

  const getOptionalServiceApi = () => {
    try {
      return host.getServiceApi();
    } catch {
      return undefined;
    }
  };

  const createDesignerScriptContext = (): LowCodeContextSource => {
    const model = cloneDeep(visualData.jsonData);
    const page = cloneDeep(currentPage.value);
    const converted = convertVisualEditorToLowCode({
      model,
      currentPage: page,
    });
    return createDesignerScriptContextSource({
      pageRecord: props.pageRecord,
      model,
      currentPage: page,
      converted,
    });
  };

  const createGridDesignerDataSources = () => {
    const converted = convertVisualEditorToLowCode({
      model: cloneDeep(visualData.jsonData),
      currentPage: cloneDeep(currentPage.value),
    });
    return collectLowCodePageDataSources({
      dataSources: {
        ...(props.pageRecord?.schema?.dataSources ?? {}),
        ...converted.dataSources,
      },
      blocks: converted.blocks,
      overlays: converted.overlays,
    });
  };

  provide(lowCodeScriptContextProviderKey, {
    getSource: createDesignerScriptContext,
  });

  type OverlayEntry = {
    block: VisualEditorBlockData;
    parentBlocks: VisualEditorBlockData[];
    index: number;
  };

  const overlayEntries = computed(() => {
    currentPage.value.overlays ??= [];
    return currentPage.value.overlays.map((block, index) => ({
      block,
      parentBlocks: currentPage.value.overlays ?? [],
      index,
    }));
  });

  const isRecord = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const isOverlayBlock = (block: VisualEditorBlockData) =>
    block.componentKey === 'lowcode-modal' ||
    block.props?.runtimeKind === 'modal' ||
    block.props?.runtimeKind === 'drawer';

  const isFillRemainingBlock = (block: VisualEditorBlockData) =>
    block.layout?.fillRemaining === true || block.props?.layout?.fillRemaining === true;

  const getSlotEntries = (block: VisualEditorBlockData) => {
    const slots = isRecord(block.props?.slots) ? block.props.slots : {};
    return Object.values(slots).filter(
      (slot): slot is { children: VisualEditorBlockData[] } =>
        isRecord(slot) && Array.isArray(slot.children),
    );
  };

  const ensureModalDesignerSlots = (block: VisualEditorBlockData) => {
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

  const ensureOverlayBlock = (block: VisualEditorBlockData) => {
    block.props ??= {};
    block.props.overlays ??= [];
    ensureModalDesignerSlots(block);
  };

  const getBlockTitle = (block: VisualEditorBlockData) =>
    String(block.props?.title || block.props?.blockId || block.label || '弹框');

  function getModalContentBlocks(block: VisualEditorBlockData) {
    return getSlotEntries(block).flatMap((slot) => slot.children);
  }

  function countDesignNodes(blocks: VisualEditorBlockData[] = []): number {
    return blocks.reduce((total, block) => {
      const childCount = getSlotEntries(block).reduce(
        (sum, slot) => sum + countDesignNodes(slot.children),
        0,
      );
      const overlayCount = countDesignNodes(block.props?.overlays ?? []);
      return total + 1 + childCount + overlayCount;
    }, 0);
  }

  function countModalNodes(block: VisualEditorBlockData) {
    return countDesignNodes(getModalContentBlocks(block)) + countDesignNodes(block.props?.overlays ?? []);
  }

  function walkDesignBlocks(
    blocks: VisualEditorBlockData[],
    callback: (block: VisualEditorBlockData) => void,
  ) {
    blocks.forEach((block) => {
      callback(block);
      getSlotEntries(block).forEach((slot) => walkDesignBlocks(slot.children, callback));
      if (Array.isArray(block.props?.overlays)) {
        walkDesignBlocks(block.props.overlays, callback);
      }
    });
  }

  function normalizeOverlayBlockList(
    blocks: VisualEditorBlockData[],
    ownerOverlays: VisualEditorBlockData[],
    isOwnerOverlayList = false,
  ) {
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
    if (normalizingOverlayPlacement) return;

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
  const findPathByLeafId = (
    leafId,
    nodes: VisualEditorBlockData[] = [
      ...currentPage.value.blocks,
      ...(currentPage.value.overlays ?? []),
    ],
    path: VisualEditorBlockData[] = [],
  ) => {
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
  const handleSlotsFocus = (block: VisualEditorBlockData, _vid: string) => {
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
  const selectComp = (element: VisualEditorBlockData) => {
    setCurrentBlock(element);
    walkDesignBlocks(
      [...currentPage.value.blocks, ...(currentPage.value.overlays ?? [])],
      (block) => {
        block.focus = element._vid == block._vid;
        block.focusWithChild = false;
      },
    );

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
  const deleteComp = (block: VisualEditorBlockData, parentBlocks = currentPage.value.blocks) => {
    const index = parentBlocks.findIndex((item) => item._vid == block._vid);
    if (index != -1) {
      delete globalProperties.$$refs[parentBlocks[index]._vid];
      const delTarget = parentBlocks.splice(index, 1)[0];
      if (delTarget.focus) {
        setCurrentBlock({} as VisualEditorBlockData);
      }
    }
  };

  const formDesignComponentKeys = new Set(['form', 'lowcode-search-form', 'lowcode-edit-form']);
  const gridDesignComponentKeys = new Set(['lowcode-grid', 'grid', 'table', 'vxe-grid']);
  const arrayTableDesignComponentKeys = new Set(['array-table', 'lc-array-table']);
  const buttonGroupDesignComponentKeys = new Set([
    'lowcode-button-group',
    'button-group',
    'buttonGroup',
  ]);
  const subFormDesignComponentKeys = new Set(['sub-form', 'lc-sub-form']);
  const modalDesignComponentKeys = new Set(['lowcode-modal']);

  const isFormDesignBlock = (block: VisualEditorBlockData) =>
    formDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.fields);

  const isGridDesignBlock = (block: VisualEditorBlockData) =>
    gridDesignComponentKeys.has(block.componentKey);

  const isArrayTableDesignBlock = (block: VisualEditorBlockData) =>
    arrayTableDesignComponentKeys.has(block.componentKey) ||
    block.props?.__lowcodeComponent === 'lc-array-table';

  const vxeGridPropKeys = [
    'border',
    'stripe',
    'showOverflow',
    'showHeaderOverflow',
    'showFooterOverflow',
    'height',
    'maxHeight',
    'size',
    'loading',
    'round',
    'showHeader',
    'showFooter',
    'autoResize',
    'syncResize',
    'rowConfig',
    'columnConfig',
    'sortConfig',
    'filterConfig',
    'pagerConfig',
    'toolbarConfig',
    'proxyConfig',
    'editConfig',
    'checkboxConfig',
    'radioConfig',
    'treeConfig',
    'expandConfig',
  ];

  const readVxeGridOptions = (props: Record<string, unknown> = {}) => {
    const legacyOptions =
      typeof props.gridOptions === 'object' && props.gridOptions !== null
        ? cloneDeep(props.gridOptions as Record<string, unknown>)
        : {};

    vxeGridPropKeys.forEach((key) => {
      if (typeof props[key] !== 'undefined') {
        legacyOptions[key] = cloneDeep(props[key]);
      }
    });

    return legacyOptions;
  };

  const isButtonGroupDesignBlock = (block: VisualEditorBlockData) =>
    buttonGroupDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.buttons);

  const isSubFormDesignBlock = (block: VisualEditorBlockData) =>
    subFormDesignComponentKeys.has(block.componentKey) ||
    block.props?.__lowcodeComponent === 'lc-sub-form';

  const isModalDesignBlock = (block: VisualEditorBlockData) =>
    modalDesignComponentKeys.has(block.componentKey) ||
    block.props?.runtimeKind === 'modal';

  const syncFormDesignToPageBlock = (
    block: VisualEditorBlockData,
    result: FormDesignerResult,
  ) => {
    const previousSchema = isRecord(block.props.schema)
      ? cloneDeep(block.props.schema)
      : {};
    const designedSchema = createLowCodeFormSchemaFromDesignerResult(result);
    block.props.fields = cloneDeep(result.fields);
    delete block.props.columns;
    block.props.schema = {
      ...previousSchema,
      ...designedSchema,
      actions: Array.isArray(previousSchema.actions)
        ? previousSchema.actions
        : designedSchema.actions,
    };
    block.props.formDesignerModel = cloneDeep(result.designerModel);
    block.props.formDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const syncGridDesignToPageBlock = (
    block: VisualEditorBlockData,
    result: GridDesignerResult,
  ) => {
    Object.assign(block.props, cloneDeep(result.business));
    block.props.detailConfig = cloneDeep(result.detailConfig);
    block.props.columns = cloneDeep(result.columns);
    Object.assign(block.props, cloneDeep(result.gridOptions));
    delete block.props.gridOptions;
    block.props.gridEvents = cloneDeep(result.gridEvents);
    block.props.gridDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const syncArrayTableDesignToFieldBlock = (
    block: VisualEditorBlockData,
    result: GridDesignerResult,
  ) => {
    const previousColumns = new Map(
      (Array.isArray(block.props.columns) ? block.props.columns : [])
        .filter(isRecord)
        .map((column) => [readString(column.field), column]),
    );
    block.props.__lowcodeComponent = 'lc-array-table';
    block.props.columns = result.columns.map((column) => {
      const previous = previousColumns.get(readString(column.field));
      const editType = readString(column.editType);
      return {
        ...(previous ? cloneDeep(previous) : {}),
        ...cloneDeep(column),
        ...(editType ? { component: editType } : {}),
      };
    });
    Object.assign(block.props, cloneDeep(result.gridOptions));
    delete block.props.gridOptions;
    const keyField = isRecord(result.gridOptions.rowConfig)
      ? result.gridOptions.rowConfig.keyField
      : undefined;
    if (keyField) {
      block.props.rowConfig = {
        ...(isRecord(block.props.rowConfig) ? block.props.rowConfig : {}),
        keyField,
      };
    }
    block.props.gridDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const syncButtonGroupDesignToPageBlock = (
    block: VisualEditorBlockData,
    result: ButtonGroupDesignerResult,
  ) => {
    Object.assign(block.props, cloneDeep(result.business));
    block.props.buttons = cloneDeep(result.buttons);
    block.props.buttonGroupDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const syncSubFormDesignToFieldBlock = (
    block: VisualEditorBlockData,
    result: FormDesignerResult,
  ) => {
    block.props.__lowcodeComponent = 'lc-sub-form';
    block.props.schema = createLowCodeFormSchemaFromDesignerResult(result);
    block.props.subFormDesignerModel = cloneDeep(result.designerModel);
    block.props.subFormDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const syncModalDesignToPageBlock = (
    block: VisualEditorBlockData,
    result: ModalDesignerResult,
  ) => {
    ensureOverlayBlock(block);
    block.props.slots.slot0.children = cloneDeep(result.blocks);
    block.props.overlays = cloneDeep(result.overlays);
    block.props.modalDesignerModel = cloneDeep(result.designerModel);
    block.props.modalDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const openFormDesigner = async (block: VisualEditorBlockData) => {
    selectComp(block);
    const isSearchForm = block.componentKey === 'lowcode-search-form';
    const runtimeSchema = isRecord(block.props?.schema) ? block.props.schema : {};
    const schemaColumns = Number(runtimeSchema.columns);
    const result = await $$formDesigner({
      title: `${block.label || '表单'}设计`,
      mode: isSearchForm ? 'search' : 'edit',
      fields: Array.isArray(block.props?.fields) ? block.props.fields : [],
      layout: Array.isArray(runtimeSchema.layout)
        ? cloneDeep(runtimeSchema.layout)
        : undefined,
      columns: Number.isFinite(schemaColumns) && schemaColumns > 0
        ? schemaColumns
        : undefined,
      designerModel: block.props?.formDesignerModel || null,
      pageData: currentPage.value,
      pageRecord: props.pageRecord,
      serviceApi: getOptionalServiceApi(),
    });

    syncFormDesignToPageBlock(block, result);
  };

  const openGridDesigner = async (block: VisualEditorBlockData) => {
    selectComp(block);
    let serviceApi;
    try {
      serviceApi = host.getServiceApi();
    } catch {
      serviceApi = undefined;
    }
    const result = await $$gridDesigner({
      title: `${block.label || '表格'}设计`,
      serviceApi,
      dataSources: createGridDesignerDataSources(),
      business: {
        blockId: block.props?.blockId,
        title: block.props?.title,
        tableType: block.props?.tableType,
        sourceType: block.props?.sourceType,
        tableName: block.props?.tableName,
        viewName: block.props?.viewName,
        categoryField: block.props?.categoryField,
        sourceKey: block.props?.sourceKey,
        serviceName: block.props?.serviceName,
        serviceMethod: block.props?.serviceMethod,
        saveMethod: block.props?.saveMethod,
        deleteMethod: block.props?.deleteMethod,
        postDataJson: block.props?.postDataJson,
        showRowActions: block.props?.showRowActions,
      },
      detailConfig: isRecord(block.props?.detailConfig)
        ? cloneDeep(block.props.detailConfig)
        : {},
      columns: Array.isArray(block.props?.columns) ? block.props.columns : [],
      gridOptions: readVxeGridOptions(block.props),
      gridEvents: Array.isArray(block.props?.gridEvents) ? block.props.gridEvents : [],
    });

    syncGridDesignToPageBlock(block, result);
  };

  const openArrayTableDesigner = async (block: VisualEditorBlockData) => {
    selectComp(block);
    const fieldLabel = readString(block.props?.label, block.label || '表格输入');
    const rowConfig = isRecord(block.props?.rowConfig)
      ? cloneDeep(block.props.rowConfig)
      : {};
    const columns = (Array.isArray(block.props?.columns) ? block.props.columns : [])
      .filter(isRecord)
      .map((column) => ({
        ...cloneDeep(column),
        editType: readString(column.editType, readString(column.component)),
      }));
    const result = await $$gridDesigner({
      title: `${fieldLabel}设计表格`,
      serviceApi: getOptionalServiceApi(),
      business: {
        blockId: readString(block.props?.name, block._vid),
        title: fieldLabel,
        tableType: 'default',
        sourceType: 'custom',
        sourceKey: '',
        serviceName: '',
        serviceMethod: '',
        saveMethod: '',
        deleteMethod: '',
        postDataJson: '{}',
        showRowActions: false,
      },
      detailConfig: {},
      columns,
      gridOptions: {
        ...readVxeGridOptions(block.props),
        rowConfig,
      },
      gridEvents: [],
    });

    syncArrayTableDesignToFieldBlock(block, result);
  };

  const openButtonGroupDesigner = async (block: VisualEditorBlockData) => {
    selectComp(block);
    const result = await $$buttonGroupDesigner({
      title: `${block.label || '按钮组'}设计`,
      serviceApi: getOptionalServiceApi(),
      business: {
        blockId: block.props?.blockId,
        title: block.props?.title,
        description: block.props?.description,
        align: block.props?.align,
        gap: block.props?.gap,
      },
      buttons: Array.isArray(block.props?.buttons) ? block.props.buttons : [],
      scriptContext: createDesignerScriptContext(),
    });

    syncButtonGroupDesignToPageBlock(block, result);
  };

  const openSubFormDesigner = async (block: VisualEditorBlockData) => {
    debugger//
    selectComp(block);
    const schema = isRecord(block.props?.schema) ? block.props.schema : null;
    const schemaFields = Array.isArray(schema?.fields) ? schema.fields : [];
    const schemaColumns = Number(schema?.columns);
    const result = await $$formDesigner({
      title: `${block.props?.label || block.label || '子表单'}设计`,
      mode: 'edit',
      fields: Array.isArray(schemaFields) ? schemaFields : [],
      layout: Array.isArray(schema?.layout) ? cloneDeep(schema.layout) : undefined,
      columns: Number.isFinite(schemaColumns) && schemaColumns > 0
        ? schemaColumns
        : undefined,
      designerModel: block.props?.subFormDesignerModel || null,
      pageData: currentPage.value,
      pageRecord: props.pageRecord,
      serviceApi: getOptionalServiceApi(),
    });

    syncSubFormDesignToFieldBlock(block, result);
  };

  const openModalDesigner = async (block: VisualEditorBlockData) => {
    selectComp(block);
    ensureOverlayBlock(block);

    const result = await $$modalDesigner({
      title: `${getBlockTitle(block)}设计`,
      blocks: getModalContentBlocks(block),
      overlays: Array.isArray(block.props?.overlays) ? block.props.overlays : [],
    });

    syncModalDesignToPageBlock(block, result);
  };

  const onContextmenuBlock = (
    e: MouseEvent,
    block: VisualEditorBlockData,
    parentBlocks = currentPage.value.blocks,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const canOpenModalDesigner = props.allowFormDesign && isModalDesignBlock(block);
    const canOpenArrayTableDesigner = isArrayTableDesignBlock(block);
    const canOpenBlockDesigner =
      canOpenArrayTableDesigner ||
      (props.allowFormDesign &&
        (isFormDesignBlock(block) ||
          isGridDesignBlock(block) ||
          isButtonGroupDesignBlock(block)));
    const canOpenSubFormDesigner = isSubFormDesignBlock(block);

    VxeUI.contextMenu.open({
      x: e.clientX,
      y: e.clientY,
      className: 'enlearn-context-menu',
      options: [
        [
          {
            code: 'open-modal-designer',
            name: '进入设计',
            prefixIcon: 'ri-edit-line',
            visible: canOpenModalDesigner,
          },
          {
            code: 'open-block-designer',
            name: '进入设计',
            prefixIcon: 'ri-edit-line',
            visible: canOpenBlockDesigner,
          },
          {
            code: 'open-sub-form-designer',
            name: '进入设计',
            prefixIcon: 'ri-edit-line',
            visible: canOpenSubFormDesigner,
          },
          {
            code: 'duplicate',
            name: '复制节点',
            prefixIcon: 'ri-file-copy-line',
          },
          {
            code: 'view',
            name: '查看节点',
            prefixIcon: 'ri-eye-line',
          },
          {
            code: 'delete',
            name: '删除节点',
            prefixIcon: 'ri-delete-bin-line',
            className: 'enlearn-context-menu-option--danger',
          },
        ],
      ],
      events: {
        optionClick({ option }) {
          if (option.code === 'open-modal-designer') {
            void openModalDesigner(block);
          }
          if (option.code === 'open-block-designer') {
            void (isButtonGroupDesignBlock(block)
              ? openButtonGroupDesigner(block)
              : isArrayTableDesignBlock(block)
                ? openArrayTableDesigner(block)
              : isGridDesignBlock(block)
                ? openGridDesigner(block)
                : openFormDesigner(block));
          }
          if (option.code === 'open-sub-form-designer') {
            void openSubFormDesigner(block);
          }
          if (option.code === 'duplicate') {
            const index = parentBlocks.findIndex((item) => item._vid == block._vid);
            if (index !== -1) {
              const setBlockVid = (target: VisualEditorBlockData) => {
                target._vid = `vid_${generateNanoid()}`;
                target.focus = false;
                const slots = target.props?.slots || {};
                Object.keys(slots).forEach((slotKey) => {
                  slots[slotKey]?.children?.forEach((child) => setBlockVid(child));
                });
                if (Array.isArray(target.props?.overlays)) {
                  target.props.overlays.forEach((child) => setBlockVid(child));
                }
              };
              const blockCopy = cloneDeep(parentBlocks[index]);
              setBlockVid(blockCopy);
              parentBlocks.splice(index + 1, 0, blockCopy);
            }
          }
          if (option.code === 'view') {
            useModal({
              title: '节点信息',
              footer: null,
              props: {
                width: 600,
              },
              content: () => (
                <MonacoEditor
                  code={JSON.stringify(block)}
                  layout={{ width: 530, height: 600 }}
                  vid={block._vid}
                />
              ),
            });
          }
          if (option.code === 'delete') {
            deleteComp(block, parentBlocks);
          }
        },
      },
    });
  };
</script>
<style lang="scss" scoped>
  @use './func' as *;

  .simulator-container {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 16px;
    overflow: auto;
    box-sizing: border-box;
    align-items: stretch;
    justify-content: stretch;
    background: #f6f8fb;

    &.is-form-workbench {
      padding: 18px 374px 18px 18px;
      align-items: flex-start;
      justify-content: center;

      .simulator-editor {
        width: min(680px, 100%);
        min-width: 420px;
        height: min(720px, 100%);
        border-radius: 12px;
        padding: 18px;
        background: #ffffff;
      }

      .simulator-editor-content {
        width: 100%;
        min-height: 640px;
        border-radius: 6px;
      }

      @media (max-width: 1114px) {
        padding-right: 18px;
      }
    }
  }

  .simulator-editor {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: auto;
    border: 1px solid #d8e0ea;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 10px 26px rgb(15 23 42 / 5%);
    box-sizing: border-box;
    background-clip: border-box;
    flex: 1 1 auto;
    flex-direction: column;
    contain: paint layout;

    &::-webkit-scrollbar {
      width: 0;
    }

    &-content {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      margin: 0;
      border: 0;
      border-radius: 10px;
      overflow: hidden;
      transform: translate(0);
      box-shadow: none;
      flex: 1 1 auto;
    }
  }

  @media (max-width: 768px) {
    .simulator-container {
      padding: 10px;
    }

    .simulator-editor,
    .simulator-editor-content {
      border-radius: 8px;
    }
  }

  .simulator-drop-zone {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow: auto;
    // overflow: hidden;
  }

  .simulator-overlay-shelf {
    display: flex;
    flex: none;
    min-height: 82px;
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    box-sizing: border-box;
    gap: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: stretch;
  }

  .simulator-overlay-card {
    position: relative;
    display: grid;
    width: 184px;
    min-width: 184px;
    padding: 10px 34px 10px 10px;
    border: 1px solid #d8e0ea;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgb(15 23 42 / 5%);
    box-sizing: border-box;
    cursor: pointer;
    gap: 3px;

    &:hover,
    &.focus {
      border-color: #409eff;
      box-shadow: 0 8px 18px rgb(29 115 216 / 12%);
    }

    strong,
    small {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: #0f172a;
      font-size: 13px;
      line-height: 18px;
    }

    small {
      color: #64748b;
      font-size: 11px;
      line-height: 15px;
    }

    > i {
      position: absolute;
      top: 10px;
      right: 10px;
      color: #64748b;
      font-size: 16px;
    }
  }

  .simulator-overlay-card__tag {
    display: inline-flex;
    width: fit-content;
    height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    background: #eff6ff;
    color: #1d73d8;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
  }

  .list-group-item {
    position: relative;
    padding: 0;
    cursor: move;

    > div {
      position: relative;
    }

    &.fillRemaining {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
      flex-direction: column;

      > div {
        display: flex;
        flex: 1 1 0;
        min-height: 0;
        flex-direction: column;
      }
    }

    &.focus {
      @include showComponentBorder;
    }

    &.drag::after {
      display: none;
    }

    &:not(.has-slot) {
      content: '';
    }

    &.focusWithChild {
      @include showContainerBorder;
    }

    i {
      cursor: pointer;
    }
  }
</style>
