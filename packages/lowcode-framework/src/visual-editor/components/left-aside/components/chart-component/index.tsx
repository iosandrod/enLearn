import { defineComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { BarChart } from '../../../common/remix-icons';
import styles from '../base-widgets/index.module.scss';
import chartComponent from '../../../../../packages/chart-component';
import type { VisualEditorComponent } from '../../../../visual-editor.utils';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';

const DraggableView = Draggable as any;

export default defineComponent({
  name: 'ChartComponent',
  label: '图表组件',
  icon: BarChart,
  order: 4.5,
  setup() {
    const { currentPath, currentPage, currentBlock, setCurrentBlock, updatePageBlock } = useVisualData();
    const registeredKeys = new Set(
      visualConfig.componentModules.chartComponents.map((component) => component.key),
    );

    Object.entries(chartComponent).forEach(([name, widget]) => {
      if (!registeredKeys.has(name)) {
        visualConfig.registry('chartComponents', name, widget);
      }
    });

    const chartComponents = visualConfig.componentModules.chartComponents;

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
        list={chartComponents}
        group={{ name: 'components', pull: 'clone', put: false }}
        clone={cloneComponent}
        item-key="key"
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
