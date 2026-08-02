<template>
  <draggable
    v-model="blocksModel"
    item-key="_vid"
    class="layer-list"
    :class="{
      'layer-list--nested': depth > 0,
      'layer-list--readonly': readonly,
    }"
    :group="dragGroup"
    :sort="!readonly"
    :disabled="readonly"
    :move="canMove"
    handle=".layer-drag-handle"
    ghost-class="layer-ghost"
    :animation="160"
  >
    <template #item="{ element: block }">
      <div class="layer-item">
        <div
          class="layer-row layer-row--block"
          :class="{
            'is-active': isActive(block),
            'is-readonly': readonly,
          }"
          @click="selectBlock(block)"
          @dblclick.stop="renameBlock(block)"
        >
          <span class="layer-drag-handle layer-icon" :class="{ 'is-disabled': readonly }">
            <Rank />
          </span>

          <span class="layer-row__text">
            <strong>{{ getBlockName(block) }}</strong>
            <small>{{ block.componentKey }}</small>
          </span>

          <span v-if="!readonly" class="layer-row__actions">
            <button
              class="layer-actions-trigger"
              type="button"
              :aria-label="`${getBlockName(block)} 操作`"
              @click.stop="openLayerActionMenu($event, block)"
            >
              <MoreFilled />
            </button>
          </span>
        </div>

        <div v-if="getSlotGroups(block).length" class="layer-children">
          <section
            v-for="group in getSlotGroups(block)"
            :key="`${block._vid}-${group.key}`"
            class="layer-group"
          >
            <div class="layer-row layer-row--slot">
              <span class="layer-icon"><FolderOpened /></span>
              <span class="layer-row__text">
                <strong>{{ group.label }}</strong>
                <small>{{ group.slot.children.length }} 个节点</small>
              </span>
            </div>
            <LayerBlockList
              v-model:blocks="group.slot.children"
              :depth="depth + 1"
            />
          </section>
        </div>

        <div v-if="getOverlayBlocks(block).length" class="layer-children">
          <section class="layer-group">
            <div class="layer-row layer-row--slot">
              <span class="layer-icon"><FolderOpened /></span>
              <span class="layer-row__text">
                <strong>弹层</strong>
                <small>{{ getOverlayBlocks(block).length }} 个节点</small>
              </span>
            </div>
            <LayerBlockList
              v-model:blocks="block.props.overlays"
              :depth="depth + 1"
              overlay-list
            />
          </section>
        </div>

        <div v-if="getFormDesignerBlocks(block).length" class="layer-children">
          <section class="layer-group layer-group--readonly">
            <div class="layer-row layer-row--slot">
              <span class="layer-icon"><Document /></span>
              <span class="layer-row__text">
                <strong>表单结构</strong>
                <small>{{ getFormDesignerBlocks(block).length }} 个节点</small>
              </span>
            </div>
            <LayerBlockList
              :blocks="getFormDesignerBlocks(block)"
              :depth="depth + 1"
              readonly
            />
          </section>
        </div>
      </div>
    </template>
  </draggable>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import draggable from 'vuedraggable';
  import { cloneDeep } from 'lodash-es';
  import { VxeUI } from 'vxe-pc-ui';
  import { ElMessage, ElMessageBox } from '../../../common/designer-ui';
  import {
    Document,
    FolderOpened,
    MoreFilled,
    Rank,
  } from '../../../common/remix-icons';
  import type { VisualEditorBlockData } from '../../../../visual-editor.utils';
  import { useGlobalProperties } from '../../../../../hooks/useGlobalProperties';
  import { useVisualData } from '../../../../hooks/useVisualData';
  import { generateNanoid } from '../../../../utils';

  defineOptions({
    name: 'LayerBlockList',
  });

  type SlotConfig = {
    key?: string;
    label?: string;
    title?: string;
    span?: string | number;
    children: VisualEditorBlockData[];
  };

  type SlotGroup = {
    key: string;
    label: string;
    slot: SlotConfig;
  };

  const props = withDefaults(
    defineProps<{
      blocks: VisualEditorBlockData[];
      depth?: number;
      readonly?: boolean;
      overlayList?: boolean;
    }>(),
    {
      depth: 0,
      readonly: false,
      overlayList: false,
    },
  );

  const emit = defineEmits<{
    'update:blocks': [blocks: VisualEditorBlockData[]];
  }>();

  const { currentPage, currentBlock, setCurrentBlock } = useVisualData();
  const { globalProperties } = useGlobalProperties();

  const blocksModel = computed({
    get: () => props.blocks,
    set: (blocks) => emit('update:blocks', blocks),
  });

  const dragGroup = computed(() =>
    props.readonly
      ? { name: 'layer-blocks', pull: false, put: false }
      : { name: 'layer-blocks' },
  );

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function readString(value: unknown, fallback = '') {
    if (typeof value === 'string') return value.trim() || fallback;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  function getBlockName(block: VisualEditorBlockData) {
    return (
      readString(block.props?.__outlineName) ||
      readString(block.props?.title) ||
      readString(block.props?.blockId) ||
      readString(block.label) ||
      readString(block.componentKey, '未命名节点')
    );
  }

  function getSlotGroups(block: VisualEditorBlockData): SlotGroup[] {
    const slots = isRecord(block.props?.slots) ? block.props.slots : {};

    return Object.entries(slots)
      .filter(([, slot]) => isRecord(slot))
      .map(([key, slot]) => {
        const slotConfig = slot as SlotConfig;
        slotConfig.children ??= [];
        const label =
          readString(slotConfig.label) ||
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

  function getOverlayBlocks(block: VisualEditorBlockData) {
    return Array.isArray(block.props?.overlays)
      ? (block.props.overlays as VisualEditorBlockData[])
      : [];
  }

  function isOverlayBlock(block: VisualEditorBlockData) {
    return (
      block.componentKey === 'lowcode-modal' ||
      block.props?.runtimeKind === 'modal' ||
      block.props?.runtimeKind === 'drawer'
    );
  }

  function getFormDesignerBlocks(block: VisualEditorBlockData) {
    const model = block.props?.formDesignerModel;
    if (!isRecord(model) || !isRecord(model.pages)) return [];

    const page = model.pages['/'];
    return isRecord(page) && Array.isArray(page.blocks)
      ? (page.blocks as VisualEditorBlockData[])
      : [];
  }

  function walkBlocks(
    blocks: VisualEditorBlockData[],
    callback: (block: VisualEditorBlockData) => void,
  ) {
    blocks.forEach((block) => {
      callback(block);
      getSlotGroups(block).forEach((group) => walkBlocks(group.slot.children, callback));
      walkBlocks(getOverlayBlocks(block), callback);
    });
  }

  function findBlockPath(
    targetVid: string,
    blocks: VisualEditorBlockData[] = [
      ...currentPage.value.blocks,
      ...(currentPage.value.overlays ?? []),
    ],
    path: VisualEditorBlockData[] = [],
  ): VisualEditorBlockData[] | null {
    for (const block of blocks) {
      const nextPath = [...path, block];
      if (block._vid === targetVid) return nextPath;

      for (const group of getSlotGroups(block)) {
        const childPath = findBlockPath(targetVid, group.slot.children, nextPath);
        if (childPath) return childPath;
      }

      const overlayPath = findBlockPath(targetVid, getOverlayBlocks(block), nextPath);
      if (overlayPath) return overlayPath;
    }

    return null;
  }

  function selectBlock(block: VisualEditorBlockData) {
    if (props.readonly) return;

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

  function isActive(block: VisualEditorBlockData) {
    return currentBlock.value?._vid === block._vid || block.focus;
  }

  function removeRefs(block: VisualEditorBlockData) {
    delete globalProperties.$$refs?.[block._vid];
    getSlotGroups(block).forEach((group) => group.slot.children.forEach(removeRefs));
    getOverlayBlocks(block).forEach(removeRefs);
  }

  function containsBlock(root: VisualEditorBlockData, targetVid?: string) {
    if (!targetVid) return false;
    let matched = root._vid === targetVid;

    walkBlocks([root], (block) => {
      if (block._vid === targetVid) {
        matched = true;
      }
    });

    return matched;
  }

  function deleteBlock(block: VisualEditorBlockData) {
    if (props.readonly) return;

    const index = blocksModel.value.findIndex((item) => item._vid === block._vid);
    if (index === -1) return;

    const [removed] = blocksModel.value.splice(index, 1);
    removeRefs(removed);

    if (containsBlock(removed, currentBlock.value?._vid)) {
      setCurrentBlock({} as VisualEditorBlockData);
    }
  }

  function resetBlockIds(block: VisualEditorBlockData) {
    block._vid = `vid_${generateNanoid()}`;
    block.focus = false;
    block.focusWithChild = false;

    getSlotGroups(block).forEach((group) => group.slot.children.forEach(resetBlockIds));
    getOverlayBlocks(block).forEach(resetBlockIds);
    getFormDesignerBlocks(block).forEach(resetBlockIds);
  }

  function copyBlock(block: VisualEditorBlockData) {
    if (props.readonly) return;

    const index = blocksModel.value.findIndex((item) => item._vid === block._vid);
    if (index === -1) return;

    const copy = cloneDeep(block);
    resetBlockIds(copy);
    copy.props ??= {};
    copy.props.__outlineName = `${getBlockName(block)} 副本`;
    blocksModel.value.splice(index + 1, 0, copy);
    selectBlock(copy);
  }

  async function renameBlock(block: VisualEditorBlockData) {
    if (props.readonly) return;

    try {
      const result = await ElMessageBox.prompt('节点名称', '重命名节点', {
        inputValue: getBlockName(block),
        inputPattern: /\S+/,
        inputErrorMessage: '请输入节点名称',
        confirmButtonText: '确定',
        cancelButtonText: '取消',
      });
      const nextName = readString(result.value);
      if (!nextName) return;

      block.props ??= {};
      block.props.__outlineName = nextName;
    } catch {
      // cancel
    }
  }

  function openLayerActionMenu(event: MouseEvent, block: VisualEditorBlockData) {
    event.preventDefault();
    event.stopPropagation();

    VxeUI.contextMenu.open({
      x: event.clientX,
      y: event.clientY,
      className: 'enlearn-context-menu',
      options: [
        [
          {
            code: 'select',
            name: '选中',
            prefixIcon: 'ri-focus-3-line',
          },
          {
            code: 'rename',
            name: '重命名',
            prefixIcon: 'ri-edit-line',
          },
          {
            code: 'copy',
            name: '复制',
            prefixIcon: 'ri-file-copy-line',
          },
          {
            code: 'delete',
            name: '删除',
            prefixIcon: 'ri-delete-bin-line',
            className: 'enlearn-context-menu-option--danger',
          },
        ],
      ],
      events: {
        optionClick({ option }) {
          if (option.code === 'select') selectBlock(block);
          if (option.code === 'rename') void renameBlock(block);
          if (option.code === 'copy') copyBlock(block);
          if (option.code === 'delete') deleteBlock(block);
        },
      },
    });
  }

  function isDescendantList(block: VisualEditorBlockData, list: unknown) {
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

  function isOverlayBlockList(list: unknown) {
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

  function canMove(event: {
    draggedContext?: { element?: VisualEditorBlockData };
    relatedContext?: { list?: VisualEditorBlockData[] };
  }) {
    if (props.readonly) return false;

    const dragged = event.draggedContext?.element;
    const targetList = event.relatedContext?.list;
    if (!dragged || !targetList) return true;

    const targetIsOverlayList = isOverlayBlockList(targetList);
    const draggedIsOverlay = isOverlayBlock(dragged);

    if (targetIsOverlayList !== draggedIsOverlay) {
      ElMessage.warning(
        targetIsOverlayList
          ? '弹层列表只能放弹框或抽屉。'
          : '弹框和抽屉请放在弹层列表中。',
      );
      return false;
    }

    const allowed = !isDescendantList(dragged, targetList);
    if (!allowed) {
      ElMessage.warning('不能移动到自身内部。');
    }

    return allowed;
  }
</script>

<style lang="scss" scoped>
  .layer-list {
    display: flex;
    min-height: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    flex-direction: column;
    gap: 6px;
  }

  .layer-list--nested {
    margin-top: 6px;
    padding-left: 12px;
    border-left: 1px dashed #cbd5e1;
  }

  .layer-list--readonly {
    opacity: 0.78;
  }

  .layer-item {
    min-width: 0;
  }

  .layer-row {
    display: flex;
    min-height: 36px;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    align-items: center;
    gap: 7px;
    box-sizing: border-box;
  }

  .layer-row--block {
    background: #ffffff;
    box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
    cursor: pointer;

    &:hover {
      border-color: #bfdbfe;
      background: #f8fbff;

      .layer-row__actions {
        opacity: 1;
      }
    }

    &.is-active {
      border-color: #409eff;
      background: #eff6ff;
    }

    &.is-readonly {
      cursor: default;
    }
  }

  .layer-row--slot {
    min-height: 30px;
    padding: 4px 8px;
    color: #64748b;
    background: transparent;
  }

  .layer-drag-handle {
    color: #94a3b8;
    cursor: grab;
    flex: none;

    &.is-disabled {
      cursor: default;
    }
  }

  .layer-row__text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;

    strong,
    small {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: #0f172a;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
    }

    small {
      color: #64748b;
      font-size: 11px;
      line-height: 15px;
    }
  }

  .layer-row__actions {
    display: inline-flex;
    opacity: 0;
    transition: opacity 0.15s ease;
    flex: none;
    position: relative;
    z-index: 2;
  }

  .layer-row--block.is-active .layer-row__actions,
  .layer-row__actions:focus-within {
    opacity: 1;
  }

  .layer-actions-trigger {
    display: grid;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid #d8e0ea;
    border-radius: 999px;
    background: #fff;
    color: #64748b;
    cursor: pointer;
    place-items: center;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      border-color: #93c5fd;
      background: #eff6ff;
      color: #1d73d8;
    }
  }

  .layer-children {
    margin: 6px 0 0 18px;
  }

  .layer-group {
    margin-top: 4px;
  }

  .layer-group--readonly {
    padding-bottom: 2px;
  }

  .layer-ghost {
    border-radius: 8px;
    background: #dbeafe;
  }
</style>
