/*
 * @Author: 卜启缘
 * @Date: 2021-07-11 17:53:54
 * @LastEditTime: 2022-07-02 22:58:55
 * @LastEditors: 卜启缘
 * @Description: 组件属性配置
 * @FilePath: /vite-vue3-lowcode/src/visual-editor/components/right-attribute-panel/components/attr-editor/components/prop-config/index.tsx
 */

import { computed, defineComponent, inject, PropType } from 'vue';
import {
  ElColorPicker,
  ElInput,
  ElOption,
  ElSelect,
  ElSwitch,
  ElInputNumber,
  ElFormItem,
  ElTooltip,
  ElIcon,
} from '../../../../../common/designer-ui';
import { Warning } from '../../../../../common/remix-icons';
import { TablePropEditor, CrossSortableOptionsEditor } from '../../components';
import { useDotProp } from '../../../../../../hooks/useDotProp';
import { VisualEditorProps, VisualEditorPropsType } from '../../../../../../visual-editor.props';
import { useVisualData } from '../../../../../../hooks/useVisualData';
import { VisualEditorBlockData, VisualEditorComponent } from '../../../../../../visual-editor.utils';
import JsonDialogInput from '../../../../../../../components/JsonDialogInput.vue';
import {
  formDesignerPageDataKey,
  formDesignerTableFieldOptionsKey,
} from '../../../../../../form-designer-context';
import { collectPageTableFieldOptions } from '../../../../../../material-prop-forms';

export const PropConfig = defineComponent({
  props: {
    component: {
      type: Object as PropType<VisualEditorComponent>,
      default: () => ({}),
    },
    block: {
      type: Object as PropType<VisualEditorBlockData>,
      default: () => ({}),
    },
  },
  setup(props) {
    const { jsonData } = useVisualData();
    const designerPageData = inject(formDesignerPageDataKey, null);
    const injectedTableFieldOptions = inject(formDesignerTableFieldOptionsKey, null);
    /** @description 当前页面所有表格列的字段集合 */
    const tableFields = computed(() =>
      injectedTableFieldOptions?.value ??
      collectPageTableFieldOptions(designerPageData?.value ?? jsonData),
    );

    const renderPropItem = (propName: string, propConfig: VisualEditorProps) => {
      const { propObj, prop } = useDotProp(props.block.props, propName);

      propObj[prop] ??= propConfig.defaultValue;
      const renderJsonInput = () => {
        return (
          <JsonDialogInput
            modelValue={propObj[prop]}
            name={propName}
            label={propConfig.label}
            placeholder={propConfig.tips || propConfig.label}
            rows={8}
            rootType={propConfig.jsonRootType}
            valueMode={propConfig.jsonValueMode || 'preserve'}
            {...{
              'onUpdate:modelValue': (value: unknown) => {
                propObj[prop] = value;
              },
            }}
          />
        );
      };

      return {
        [VisualEditorPropsType.input]: () => {
          if (!Object.is(propObj[prop], undefined) && !Object.is(propObj[prop], null)) {
            propObj[prop] = `${propObj[prop]}`;
          }
          return (
            <ElInput v-model={propObj[prop]} placeholder={propConfig.tips || propConfig.label} />
          );
        },
        [VisualEditorPropsType.inputNumber]: () => {
          const parseRes = parseFloat(propObj[prop]);
          propObj[prop] = Number.isNaN(parseRes) ? 0 : parseRes;
          return <ElInputNumber v-model={propObj[prop]} />;
        },
        [VisualEditorPropsType.switch]: () => <ElSwitch v-model={propObj[prop]} />,
        [VisualEditorPropsType.color]: () => <ElColorPicker v-model={propObj[prop]} />,
        [VisualEditorPropsType.crossSortable]: () => (
          <CrossSortableOptionsEditor
            v-model={propObj[prop]}
            multiple={propConfig.multiple}
            showItemPropsConfig={propConfig.showItemPropsConfig}
          />
        ),
        [VisualEditorPropsType.select]: () => (
          <ElSelect v-model={propObj[prop]} valueKey={'value'} multiple={propConfig.multiple}>
            {propConfig.options?.map((opt) => (
              <ElOption label={opt.label} style={{ fontFamily: opt.value }} value={opt.value} />
            ))}
          </ElSelect>
        ),
        [VisualEditorPropsType.table]: () => (
          <TablePropEditor v-model={propObj[prop]} propConfig={propConfig} />
        ),
        [VisualEditorPropsType.modelBind]: () => {
          if (Array.isArray(propObj[prop])) {
            propObj[prop] = propObj[prop][propObj[prop].length - 1] ?? '';
          }
          return (
            <ElSelect
              v-model={propObj[prop]}
              options={tableFields.value}
              clearable={true}
              filterable={true}
              allowCreate={true}
              placeholder="请选择或输入字段"
            />
          );
        },
        [VisualEditorPropsType.json]: renderJsonInput,
      }[propConfig.type]();
    };

    return () => {
      return Object.entries(props.component.props ?? {}).map(([propName, propConfig]) => (
        <>
          <ElFormItem
            key={props.block._vid + propName}
            style={
              propConfig.labelPosition == 'top'
                ? {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }
                : {}
            }
          >
            {{
              label: () => (
                <>
                  {propConfig.tips && (
                    <ElTooltip
                      placement="left-start"
                      popper-class="max-w-200px"
                      content={propConfig.tips}
                    >
                      <div>
                        <ElIcon>
                          <Warning />
                        </ElIcon>
                      </div>
                    </ElTooltip>
                  )}
                  {propConfig.label}
                </>
              ),
              default: () => renderPropItem(propName, propConfig),
            }}
          </ElFormItem>
        </>
      ));
    };
  },
});
