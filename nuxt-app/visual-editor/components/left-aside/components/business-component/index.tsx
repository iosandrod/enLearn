import { defineComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { DataBoard } from '@/visual-editor/components/common/remix-icons';
import styles from './index.module.scss';
import type { VisualEditorComponent } from '@/visual-editor/visual-editor.utils';
import { visualConfig } from '@/visual.config';
import { createNewBlock } from '@/visual-editor/visual-editor.utils';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'BusinessComponent',
  label: '业务组件',
  icon: DataBoard,
  order: 5,
  setup() {
    const cloneDog = (comp: VisualEditorComponent) => {
      const newComp = cloneDeep(comp);
      return createNewBlock(newComp);
    };

    return () => (
      <DraggableView
        class={styles.listGroup}
        sort={false}
        forceFallback={false}
        list={visualConfig.componentModules.businessComponents}
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
    );
  },
});
