/*
 * @Author: 卜启缘
 * @Date: 2021-06-01 13:22:14
 * @LastEditTime: 2021-07-11 11:04:06
 * @LastEditors: 卜启缘
 * @Description:
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\left-aside\components\container-component\index.tsx
 */
import { defineComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { Suitcase } from '../../../common/remix-icons';
import styles from './index.module.scss';
import type { VisualEditorComponent } from '../../../../visual-editor.utils';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'ContainerComponent',
  label: '容器组件',
  icon: Suitcase,
  order: 4,
  setup() {
    const { currentPath, currentPage, currentBlock, setCurrentBlock, updatePageBlock } = useVisualData();
    const addMaterial = (component: VisualEditorComponent) => {
      const block = createNewBlock(cloneDeep(component));
      if (currentBlock.value?.focus) currentBlock.value.focus = false;
      block.focus = true;
      updatePageBlock(currentPath.value, [...(currentPage.value.blocks ?? []), block]);
      setCurrentBlock(block);
    };
    // 克隆组件
    const cloneDog = (comp) => {
      const newComp = cloneDeep(comp);
      return createNewBlock(newComp);
    };

    return () => (
      <>
        <DraggableView
          class={styles.listGroup}
          sort={false}
          forceFallback={false}
          list={visualConfig.componentModules.containerComponents}
          group={{ name: 'components', pull: 'clone', put: false }}
          clone={cloneDog}
          item-key="_vid"
        >
          {{
            item: ({ element }: { element: VisualEditorComponent }) => (
              <button type="button" class={styles.listGroupItem} data-label={element.label} onClick={() => addMaterial(element)}>
                {element.preview()}
              </button>
            ),
          }}
        </DraggableView>
      </>
    );
  },
});
