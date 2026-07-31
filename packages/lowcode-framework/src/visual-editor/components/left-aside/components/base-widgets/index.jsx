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
import DraggableTransitionGroup from '../../../simulator-editor/draggable-transition-group.vue';
const DraggableTransitionGroupView = DraggableTransitionGroup;
export default defineComponent({
    name: 'BaseWidgets',
    label: '基本组件',
    order: 3,
    icon: Edit,
    setup() {
        const baseWidgets = ref(visualConfig.componentModules.baseWidgets);
        // 克隆组件
        const cloneDog = (comp) => {
            const newComp = cloneDeep(comp);
            return createNewBlock(newComp);
        };
        return () => (<>
        <DraggableTransitionGroupView class={styles.listGroup} v-model={baseWidgets.value} group={{ name: 'components', pull: 'clone', put: false }} clone={cloneDog} itemKey={'key'}>
          {{
                item: ({ element }) => (<div class={styles.listGroupItem} data-label={element.label}>
                {element.preview()}
              </div>),
            }}
        </DraggableTransitionGroupView>
      </>);
    },
});
