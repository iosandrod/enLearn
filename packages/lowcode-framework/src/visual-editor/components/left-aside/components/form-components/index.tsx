import { defineComponent, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { DocumentChecked } from '../../../common/remix-icons';
import styles from '../base-widgets/index.module.scss';
import type { VisualEditorComponent } from '../../../../visual-editor.utils';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'FormComponents',
  label: '表单组件',
  icon: DocumentChecked,
  order: 3.5,
  setup() {
    const { currentPath, currentPage, currentBlock, setCurrentBlock, updatePageBlock } = useVisualData();
    const formComponents = ref(visualConfig.componentModules.formComponents);

    const cloneComponent = (comp: VisualEditorComponent) => {
      const newComp = cloneDeep(comp);
      return createNewBlock(newComp);
    };
    const addMaterial = (component: VisualEditorComponent) => {
      const block = cloneComponent(component);
      if (currentBlock.value?.focus) currentBlock.value.focus = false;
      block.focus = true;
      updatePageBlock(currentPath.value, [...(currentPage.value.blocks ?? []), block]);
      setCurrentBlock(block);
    };

    return () => (
      <DraggableView
        class={styles.listGroup}
        sort={false}
        forceFallback={false}
        list={formComponents.value}
        group={{ name: 'components', pull: 'clone', put: false }}
        clone={cloneComponent}
        item-key="_vid"
      >
        {{
          item: ({ element }: { element: VisualEditorComponent }) => (
            <button
              type="button"
              class={[styles.listGroupItem, styles.formMaterialItem]}
              data-label={element.label}
              onClick={() => addMaterial(element)}
            >
              <div class={styles.formMaterialPreview}>{element.preview()}</div>
            </button>
          ),
        }}
      </DraggableView>
    );
  },
});
