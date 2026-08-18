import { computed, defineComponent, inject } from 'vue';
import { cloneDeep } from 'lodash-es';
import Draggable from 'vuedraggable';
import { Document } from '../../../common/remix-icons';
import styles from '../base-widgets/index.module.scss';
import { visualConfig } from '../../../../../visual.config';
import { createNewBlock, type VisualEditorComponent } from '../../../../visual-editor.utils';
import { useVisualData } from '../../../../hooks/useVisualData';
import {
  formDesignerModeKey,
  formDesignerTableFieldOptionsKey,
} from '../../../../form-designer-context';
import type { LowCodeOption } from '../../../../../types/lowcode';

const DraggableView = Draggable as any;

type ColumnInputMaterial = VisualEditorComponent & {
  columnField: string;
  columnLabel: string;
};

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function getColumnLabel(option: LowCodeOption) {
  const field = readString(option.value);
  const label = readString(option.label, field);
  const suffix = ` (${field})`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

function collectFormFields(value: unknown, fields: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFormFields(item, fields));
    return;
  }

  if (!value || typeof value !== 'object') return;
  const block = value as Record<string, unknown>;
  const props =
    block.props && typeof block.props === 'object' && !Array.isArray(block.props)
      ? (block.props as Record<string, unknown>)
      : {};
  const field = readString(props.name);
  if (field) fields.add(field);

  const slots =
    props.slots && typeof props.slots === 'object' && !Array.isArray(props.slots)
      ? (props.slots as Record<string, unknown>)
      : {};
  Object.values(slots).forEach((slot) => {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return;
    collectFormFields((slot as Record<string, unknown>).children, fields);
  });
}

function createColumnInputMaterial(
  option: LowCodeOption,
  inputComponent: VisualEditorComponent,
): ColumnInputMaterial | null {
  const field = readString(option.value);
  if (!field) return null;

  const label = getColumnLabel(option);
  const material = {
    ...cloneDeep(inputComponent),
    key: `column-input-${field}`,
    label,
    columnField: field,
    columnLabel: label,
  } as ColumnInputMaterial;

  material.preview = () => (
    <div class="column-component-preview">
      <strong>{label}</strong>
      <small>{field}</small>
    </div>
  );

  return material;
}

export default defineComponent({
  name: 'ColumnComponents',
  label: '列组件',
  icon: Document,
  order: 6.5,
  setup() {
    const { currentPage } = useVisualData();
    const mode = inject(formDesignerModeKey, null);
    const injectedTableFieldOptions = inject(formDesignerTableFieldOptionsKey, null);
    const inputComponent = visualConfig.componentMap.input;

    const existingFields = computed(() => {
      const fields = new Set<string>();
      collectFormFields(currentPage.value.blocks, fields);
      collectFormFields(currentPage.value.overlays, fields);
      return fields;
    });

    const materials = computed(() => {
      if (mode?.value !== 'edit' || !inputComponent) return [];

      const options = injectedTableFieldOptions?.value ?? [];
      return options
        .filter((option) => {
          const field = readString(option.value);
          return field && !existingFields.value.has(field);
        })
        .map((option) => createColumnInputMaterial(option, inputComponent))
        .filter(Boolean) as ColumnInputMaterial[];
    });

    const cloneComponent = (material: ColumnInputMaterial) => {
      const block = createNewBlock(inputComponent);
      block.label = material.columnLabel;
      block.props.name = material.columnField;
      block.props.label = material.columnLabel;
      block.props.placeholder = `请输入${material.columnLabel}`;
      return block;
    };

    return () => (
      <div class="column-components-panel">
        {materials.value.length ? (
          <DraggableView
            class={styles.listGroup}
            sort={false}
            forceFallback={false}
            list={materials.value}
            group={{ name: 'components', pull: 'clone', put: false }}
            clone={cloneComponent}
            item-key="key"
          >
            {{
              item: ({ element }: { element: ColumnInputMaterial }) => (
                <div class={styles.listGroupItem} data-label={element.columnLabel}>
                  {element.preview()}
                </div>
              ),
            }}
          </DraggableView>
        ) : (
          <div class="column-components-empty">
            <span>当前关联表格没有可添加的列</span>
          </div>
        )}
      </div>
    );
  },
});
