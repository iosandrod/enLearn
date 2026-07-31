import { defineComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { DataBoard } from '../../../common/remix-icons';
import styles from './index.module.scss';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';
const DraggableView = Draggable;
export default defineComponent({
    name: 'BusinessComponent',
    label: '业务组件',
    icon: DataBoard,
    order: 5,
    setup() {
        const cloneDog = (comp) => {
            const newComp = cloneDeep(comp);
            return createNewBlock(newComp);
        };
        return () => (<DraggableView class={styles.listGroup} sort={false} forceFallback={false} list={visualConfig.componentModules.businessComponents} group={{ name: 'components', pull: 'clone', put: false }} clone={cloneDog} item-key="_vid">
        {{
                item: ({ element }) => (<div class={styles.listGroupItem} data-label={element.label}>
              {element.preview()}
            </div>),
            }}
      </DraggableView>);
    },
});
