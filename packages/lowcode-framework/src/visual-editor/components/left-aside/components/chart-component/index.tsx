import { defineComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { BarChart } from '../../../common/remix-icons';
import styles from '../base-widgets/index.module.scss';
import type { VisualEditorComponent } from '../../../../visual-editor.utils';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'ChartComponent',
  label: '图表组件',
  icon: BarChart,
  order: 4.5,
  setup() {
    const cloneComponent = (comp: VisualEditorComponent) => {
      const newComp = cloneDeep(comp);
      return createNewBlock(newComp);
    };

    return () => (
      <DraggableView
        class={styles.listGroup}
        sort={false}
        forceFallback={false}
        list={visualConfig.componentModules.chartComponents}
        group={{ name: 'components', pull: 'clone', put: false }}
        clone={cloneComponent}
        item-key="key"
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
