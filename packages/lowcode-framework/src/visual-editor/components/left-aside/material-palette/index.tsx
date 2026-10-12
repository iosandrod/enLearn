import { defineComponent, type PropType } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { Rank } from '../../common/remix-icons';
import {
  createNewBlock,
  type VisualEditorBlockData,
  type VisualEditorComponent,
} from '../../../visual-editor.utils';
import { useVisualData } from '../../../hooks/useVisualData';
import styles from './index.module.scss';

const DraggableView = Draggable as any;
export type MaterialPaletteItem = VisualEditorComponent & Record<string, unknown>;

export default defineComponent({
  name: 'MaterialPalette',
  props: {
    items: { type: Array as PropType<MaterialPaletteItem[]>, required: true },
    cloneItem: {
      type: Function as PropType<(item: MaterialPaletteItem) => VisualEditorBlockData>,
      default: undefined,
    },
    emptyText: { type: String, default: '暂无可添加的组件' },
    renderPreview: { type: Boolean, default: true },
  },
  setup(props) {
    const {
      currentPath,
      currentPage,
      currentBlock,
      setCurrentBlock,
      updatePageBlock,
    } = useVisualData();
    const cloneMaterial = (item: MaterialPaletteItem) =>
      props.cloneItem?.(item) ?? createNewBlock(cloneDeep(item));
    const addMaterial = (item: MaterialPaletteItem) => {
      const block = cloneMaterial(item);
      if (currentBlock.value?.focus) currentBlock.value.focus = false;
      block.focus = true;
      updatePageBlock(currentPath.value, [...(currentPage.value.blocks ?? []), block]);
      setCurrentBlock(block);
    };
    return () => (
      <div class={styles.materialPalette} data-material-palette>
        {props.items.length ? (
          <DraggableView
            class={styles.listGroup}
            sort={false}
            forceFallback={false}
            list={props.items}
            group={{ name: 'components', pull: 'clone', put: false }}
            clone={cloneMaterial}
            item-key="key"
            ghost-class={styles.dragGhost}
            chosen-class={styles.dragChosen}
          >
            {{
              item: ({ element }: { element: MaterialPaletteItem }) => (
                <button
                  type="button"
                  class={styles.listGroupItem}
                  data-material-card
                  title={`添加${element.label}`}
                  aria-label={`添加${element.label}`}
                  onClick={() => addMaterial(element)}
                >
                  <span class={styles.materialHeader}>
                    <span class={styles.materialLabel}>{element.label}</span>
                    <Rank class={styles.dragHandle} />
                  </span>
                  <span class={styles.materialPreview} data-material-preview>
                    {props.renderPreview ? (
                      element.preview()
                    ) : (
                      <span class={styles.materialFallback}>{element.label}</span>
                    )}
                  </span>
                </button>
              ),
            }}
          </DraggableView>
        ) : (
          <div class={styles.emptyState}>{props.emptyText}</div>
        )}
      </div>
    );
  },
});
