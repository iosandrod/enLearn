import { defineComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { DataBoard } from '../../../common/remix-icons';
import styles from './index.module.scss';
import type { VisualEditorComponent } from '../../../../visual-editor.utils';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'BusinessComponent',
  label: '业务组件',
  icon: DataBoard,
  order: 5,
  setup() {
    const { currentPath, currentPage, currentBlock, setCurrentBlock, updatePageBlock } = useVisualData();
    const addMaterial = (component: VisualEditorComponent) => {
      const block = createNewBlock(cloneDeep(component));
      if (currentBlock.value?.focus) currentBlock.value.focus = false;
      block.focus = true;
      updatePageBlock(currentPath.value, [...(currentPage.value.blocks ?? []), block]);
      setCurrentBlock(block);
    };
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
            <button type="button" class={styles.listGroupItem} data-label={element.label} onClick={() => addMaterial(element)}>
              {element.preview()}
            </button>
          ),
        }}
      </DraggableView>
    );
  },
});
