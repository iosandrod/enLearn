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

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'ContainerComponent',
  label: '容器组件',
  icon: Suitcase,
  order: 4,
  setup() {
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
              <div class={styles.listGroupItem} data-label={element.label}>
                {element.preview()}
              </div>
            ),
          }}
        </DraggableView>
      </>
    );
  },
});
