<template>
  <div class="simulator-container" :class="{ 'is-form-workbench': workbenchMode === 'form' }">
    <div class="simulator-editor">
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
  } from '../form-designer/form-designer.service';
  import {
    $$gridDesigner,
    type GridDesignerResult,
  } from '../grid-designer/grid-designer.service';
  import {
    $$buttonGroupDesigner,
    type ButtonGroupDesignerResult,
  } from '../button-group-designer/button-group-designer.service';

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
  const gridDesignComponentKeys = new Set(['lowcode-grid', 'grid', 'table', 'vxe-grid']);
  const buttonGroupDesignComponentKeys = new Set([
    'lowcode-button-group',
    'button-group',
    'buttonGroup',
  ]);
  const subFormDesignComponentKeys = new Set(['sub-form', 'lc-sub-form']);

  const isFormDesignBlock = (block: VisualEditorBlockData) =>
    formDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.fields);

  const isGridDesignBlock = (block: VisualEditorBlockData) =>
    gridDesignComponentKeys.has(block.componentKey) ||
    (Array.isArray(block.props?.columns) && !isFormDesignBlock(block));

  const isButtonGroupDesignBlock = (block: VisualEditorBlockData) =>
    buttonGroupDesignComponentKeys.has(block.componentKey) || Array.isArray(block.props?.buttons);

  const isSubFormDesignBlock = (block: VisualEditorBlockData) =>
    subFormDesignComponentKeys.has(block.componentKey) ||
    block.props?.__lowcodeComponent === 'lc-sub-form';

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

  const syncGridDesignToPageBlock = (
    block: VisualEditorBlockData,
    result: GridDesignerResult,
  ) => {
    Object.assign(block.props, cloneDeep(result.business));
    block.props.columns = cloneDeep(result.columns);
    block.props.gridOptions = cloneDeep(result.gridOptions);
    block.props.gridEvents = cloneDeep(result.gridEvents);
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
    block.props.fields = cloneDeep(result.fields);
    block.props.subFormDesignerModel = cloneDeep(result.designerModel);
    block.props.subFormDesignerUpdatedAt = Date.now();
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

  const openGridDesigner = async (block: VisualEditorBlockData) => {
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
      gridOptions:
        typeof block.props?.gridOptions === 'object' && block.props?.gridOptions !== null
          ? block.props.gridOptions
          : {},
      gridEvents: Array.isArray(block.props?.gridEvents) ? block.props.gridEvents : [],
    });

    syncGridDesignToPageBlock(block, result);
  };

  const openButtonGroupDesigner = async (block: VisualEditorBlockData) => {
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

  const openSubFormDesigner = async (block: VisualEditorBlockData) => {
    selectComp(block);
    const result = await $$formDesigner({
      title: `${block.props?.label || block.label || '子表单'}设计`,
      mode: 'edit',
      fields: Array.isArray(block.props?.fields) ? block.props.fields : [],
      designerModel: block.props?.subFormDesignerModel || null,
    });

    syncSubFormDesignToFieldBlock(block, result);
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
          {props.allowFormDesign &&
            (isFormDesignBlock(block) ||
              isGridDesignBlock(block) ||
              isButtonGroupDesignBlock(block)) && (
            <DropdownOption
              label="进入设计"
              icon="ri-edit-line"
              {...{
                onClick: () =>
                  void (isButtonGroupDesignBlock(block)
                    ? openButtonGroupDesigner(block)
                    : isGridDesignBlock(block)
                    ? openGridDesigner(block)
                    : openFormDesigner(block)),
              }}
            />
          )}
          {isSubFormDesignBlock(block) && (
            <DropdownOption
              label="进入设计"
              icon="ri-edit-line"
              {...{
                onClick: () => void openSubFormDesigner(block),
              }}
            />
          )}
          <DropdownOption
            label="复制节点"
            icon="ri-file-copy-line"
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
            icon="ri-eye-line"
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
            icon="ri-delete-bin-line"
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
    contain: paint layout;

    &::-webkit-scrollbar {
      width: 0;
    }

    &-content {
      width: 100%;
      height: 100%;
      min-height: 100%;
      margin: 0;
      border: 0;
      border-radius: 10px;
      overflow: visible;
      transform: translate(0);
      box-shadow: none;
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
    width: 100%;
    height: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
  }

  .list-group-item {
    position: relative;
    padding: 0;
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
