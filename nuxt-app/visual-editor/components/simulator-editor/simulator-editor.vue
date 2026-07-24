<template>
  <div class="simulator-container" :class="{ 'is-form-workbench': workbenchMode === 'form' }">
    <div class="simulator-editor">
      <div class="simulator-editor-content" :style="pageStyle">
        <DraggableTransitionGroup
          v-model:drag="drag"
          v-model="currentPage.blocks"
          class="!min-h-680px"
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
  import { computed, ref } from 'vue';
  import { cloneDeep } from 'lodash-es';
  import DraggableTransitionGroup from './draggable-transition-group.vue';
  import CompRender from './comp-render';
  import SlotItem from './slot-item.vue';
  import type { VisualEditorBlockData } from '@/visual-editor/visual-editor.utils';
  import { $$dropdown, DropdownOption } from '@/visual-editor/utils/dropdown-service';
  import MonacoEditor from '@/visual-editor/components/common/monaco-editor/MonacoEditor';
  import { useGlobalProperties } from '@/hooks/useGlobalProperties';
  import { useVisualData } from '@/visual-editor/hooks/useVisualData';
  import { useModal } from '@/visual-editor/hooks/useModal';
  import { generateNanoid } from '@/visual-editor/utils';
  import {
    $$formDesigner,
    type FormDesignerResult,
  } from '@/visual-editor/components/form-designer/form-designer.service';

  defineOptions({
    name: 'SimulatorEditor',
  });

  const props = withDefaults(
    defineProps<{
      allowFormDesign?: boolean;
      workbenchMode?: 'page' | 'form';
    }>(),
    {
      allowFormDesign: true,
      workbenchMode: 'page',
    },
  );

  const { currentPage, setCurrentBlock } = useVisualData();

  const { globalProperties } = useGlobalProperties();

  const drag = ref(false);

  const pageStyle = computed(() => {
    const { bgImage, bgColor } = currentPage.value.config;

    return {
      backgroundColor: bgColor || '#ffffff',
      backgroundImage: bgImage ? `url(${bgImage})` : undefined,
    };
  });

  //递归实现
  //@leafId  为你要查找的id，
  //@nodes   为原始Json数据
  //@path    供递归使用，不要赋值
  const findPathByLeafId = (
    leafId,
    nodes: VisualEditorBlockData[] = [],
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
    currentPage.value.blocks.forEach((block) => {
      block.focus = element._vid == block._vid;
      block.focusWithChild = false;
      handleSlotsFocus(block, element._vid);
      element.focusWithChild = false;
    });
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

  const isFormDesignBlock = (block: VisualEditorBlockData) =>
    formDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.fields);

  const syncFormDesignToPageBlock = (
    block: VisualEditorBlockData,
    result: FormDesignerResult,
  ) => {
    block.props.fields = cloneDeep(result.fields);
    delete block.props.columns;
    block.props.formDesignerModel = cloneDeep(result.designerModel);
    block.props.formDesignerUpdatedAt = Date.now();
    selectComp(block);
  };

  const openFormDesigner = async (block: VisualEditorBlockData) => {
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

  const onContextmenuBlock = (
    e: MouseEvent,
    block: VisualEditorBlockData,
    parentBlocks = currentPage.value.blocks,
  ) => {
    $$dropdown({
      reference: e,
      content: () => (
        <>
          {props.allowFormDesign && isFormDesignBlock(block) && (
            <DropdownOption
              label="进入设计"
              icon="el-icon-edit"
              {...{
                onClick: () => void openFormDesigner(block),
              }}
            />
          )}
          <DropdownOption
            label="复制节点"
            icon="el-icon-document-copy"
            {...{
              onClick: () => {
                const index = parentBlocks.findIndex((item) => item._vid == block._vid);
                if (index != -1) {
                  const setBlockVid = (block: VisualEditorBlockData) => {
                    block._vid = `vid_${generateNanoid()}`;
                    block.focus = false;
                    const slots = block?.props?.slots || {};
                    const slotKeys = Object.keys(slots);
                    if (slotKeys.length) {
                      slotKeys.forEach((slotKey) => {
                        slots[slotKey]?.children?.forEach((child) => setBlockVid(child));
                      });
                    }
                  };
                  const blockCopy = cloneDeep(parentBlocks[index]);
                  setBlockVid(blockCopy);
                  parentBlocks.splice(index + 1, 0, blockCopy);
                }
              },
            }}
          />
          <DropdownOption
            label="查看节点"
            icon="el-icon-view"
            {...{
              onClick: () =>
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
                }),
            }}
          />
          <DropdownOption
            label="删除节点"
            icon="el-icon-delete"
            {...{
              onClick: () => deleteComp(block, parentBlocks),
            }}
          />
        </>
      ),
    });
  };
</script>
<style lang="scss" scoped>
  @import './func.scss';

  .simulator-container {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 24px 384px 24px 24px;
    overflow: auto;
    box-sizing: border-box;
    align-items: flex-start;
    justify-content: center;

    @media (max-width: 1114px) {
      padding-right: 24px;
    }

    &.is-form-workbench {
      padding: 18px 374px 18px 18px;

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
    width: 420px;
    height: min(760px, 100%);
    min-width: 420px;
    min-height: 620px;
    padding: 48px 30px 24px;
    overflow: hidden auto;
    border: 1px solid #dbe3ee;
    border-radius: 24px;
    background: linear-gradient(180deg, #fbfdff 0%, #f3f7fb 100%);
    box-shadow:
      0 18px 42px rgb(15 23 42 / 10%),
      inset 0 0 0 1px rgb(255 255 255 / 70%);
    box-sizing: border-box;
    background-clip: content-box;
    flex: none;
    contain: paint layout;

    &::-webkit-scrollbar {
      width: 0;
    }

    &-content {
      width: 360px;
      min-height: 100%;
      margin: 0 auto;
      border: 1px solid #eef2f7;
      border-radius: 4px;
      overflow: hidden;
      transform: translate(0);
      box-shadow: 0 12px 28px rgb(15 23 42 / 8%);
    }
  }

  .list-group-item {
    position: relative;
    padding: 3px;
    cursor: move;

    > div {
      position: relative;
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
