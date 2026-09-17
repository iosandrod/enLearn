/*
 * @Author: 卜启缘
 * @Date: 2021-06-01 13:22:14
 * @LastEditTime: 2021-07-11 11:05:06
 * @LastEditors: 卜启缘
 * @Description: 基础组件
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\left-aside\components\base-widgets\index.tsx
 */
import { defineComponent, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import { Edit } from '../../../common/remix-icons';
import styles from './index.module.scss';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';
import DraggableTransitionGroup from '../../../simulator-editor/draggable-transition-group.vue';

const DraggableTransitionGroupView = DraggableTransitionGroup as any;

export default defineComponent({
  name: 'BaseWidgets',
  label: '基本组件',
  order: 3,
  icon: Edit,
  setup() {
    const baseWidgets = ref(visualConfig.componentModules.baseWidgets);
    const { currentPath, currentPage, currentBlock, setCurrentBlock, updatePageBlock } = useVisualData();

    const addMaterial = (component) => {
      const block = createNewBlock(cloneDeep(component));
      if (currentBlock.value?.focus) currentBlock.value.focus = false;
      block.focus = true;
      updatePageBlock(currentPath.value, [...(currentPage.value.blocks ?? []), block]);
      setCurrentBlock(block);
    };

    return () => (
      <DraggableTransitionGroupView
        class={styles.listGroup}
        v-model={baseWidgets.value}
        group={{ name: 'components', pull: 'clone', put: false }}
        clone={(component) => createNewBlock(cloneDeep(component))}
        itemKey="key"
      >
        {{
          item: ({ element }) => (
            <button
              type="button"
              class={styles.listGroupItem}
              data-label={element.label}
              title={`添加${element.label}`}
              onClick={() => addMaterial(element)}
            >
              <span>{String(element.label || element.key || '组件')}</span>
            </button>
          ),
        }}
      </DraggableTransitionGroupView>
    );
  },
});
