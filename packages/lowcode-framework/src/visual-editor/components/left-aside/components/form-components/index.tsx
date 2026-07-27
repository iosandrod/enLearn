import { defineComponent, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { DocumentChecked } from '../../../common/remix-icons';
import styles from '../base-widgets/index.module.scss';
import type { VisualEditorComponent } from '../../../../visual-editor.utils';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'FormComponents',
  label: '表单组件',
  icon: DocumentChecked,
  order: 3.5,
  setup() {
    const formComponents = ref(visualConfig.componentModules.formComponents);

    const cloneComponent = (comp: VisualEditorComponent) => {
      const newComp = cloneDeep(comp);
      return createNewBlock(newComp);
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
            <div class={styles.listGroupItem} data-label={element.label}>
              {element.preview()}
            </div>
          ),
        }}
      </DraggableView>
    );
  },
});
