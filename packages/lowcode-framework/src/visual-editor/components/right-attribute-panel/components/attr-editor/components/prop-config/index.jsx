/*
 * @Author: 卜启缘
 * @Date: 2021-07-11 17:53:54
 * @LastEditTime: 2022-07-02 22:58:55
 * @LastEditors: 卜启缘
 * @Description: 组件属性配置
 * @FilePath: /vite-vue3-lowcode/src/visual-editor/components/right-attribute-panel/components/attr-editor/components/prop-config/index.tsx
 */
import { computed, defineComponent } from 'vue';
import { ElColorPicker, ElInput, ElOption, ElSelect, ElSwitch, ElCascader, ElInputNumber, ElFormItem, ElTooltip, ElIcon, } from '../../../../../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import { Warning } from '../../../../../common/remix-icons';
import { TablePropEditor, CrossSortableOptionsEditor } from '../../components';
import { useDotProp } from '../../../../../../hooks/useDotProp';
import { VisualEditorPropsType } from '../../../../../../visual-editor.props';
import { useVisualData } from '../../../../../../hooks/useVisualData';
export const PropConfig = defineComponent({
    props: {
        component: {
            type: Object,
            default: () => ({}),
        },
        block: {
            type: Object,
            default: () => ({}),
        },
    },
    setup(props) {
        const { jsonData } = useVisualData();
        /**
         * @description 模型集合
         */
        const models = computed(() => cloneDeep(jsonData.models));
        const renderPropItem = (propName, propConfig) => {
            const { propObj, prop } = useDotProp(props.block.props, propName);
            propObj[prop] ??= propConfig.defaultValue;
            return {
                [VisualEditorPropsType.input]: () => {
                    if (!Object.is(propObj[prop], undefined) && !Object.is(propObj[prop], null)) {
                        propObj[prop] = `${propObj[prop]}`;
                    }
                    return (<ElInput v-model={propObj[prop]} placeholder={propConfig.tips || propConfig.label}/>);
                },
                [VisualEditorPropsType.inputNumber]: () => {
                    const parseRes = parseFloat(propObj[prop]);
                    propObj[prop] = Number.isNaN(parseRes) ? 0 : parseRes;
                    return <ElInputNumber v-model={propObj[prop]}/>;
                },
                [VisualEditorPropsType.switch]: () => <ElSwitch v-model={propObj[prop]}/>,
                [VisualEditorPropsType.color]: () => <ElColorPicker v-model={propObj[prop]}/>,
                [VisualEditorPropsType.crossSortable]: () => (<CrossSortableOptionsEditor v-model={propObj[prop]} multiple={propConfig.multiple} showItemPropsConfig={propConfig.showItemPropsConfig}/>),
                [VisualEditorPropsType.select]: () => (<ElSelect v-model={propObj[prop]} valueKey={'value'} multiple={propConfig.multiple}>
            {propConfig.options?.map((opt) => (<ElOption label={opt.label} style={{ fontFamily: opt.value }} value={opt.value}/>))}
          </ElSelect>),
                [VisualEditorPropsType.table]: () => (<TablePropEditor v-model={propObj[prop]} propConfig={propConfig}/>),
                [VisualEditorPropsType.modelBind]: () => (models.value.length ? (<ElCascader clearable={true} props={{
                        checkStrictly: true,
                        children: 'entitys',
                        label: 'name',
                        value: 'key',
                        expandTrigger: 'hover',
                    }} placeholder="请选择绑定的请求数据" v-model={propObj[prop]} options={[...models.value]}></ElCascader>) : (<ElInput v-model={propObj[prop]} placeholder={propConfig.tips || propConfig.label}/>)),
            }[propConfig.type]();
        };
        return () => {
            return Object.entries(props.component.props ?? {}).map(([propName, propConfig]) => (<>
          <ElFormItem key={props.block._vid + propName} style={propConfig.labelPosition == 'top'
                    ? {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                    }
                    : {}}>
            {{
                    label: () => (<>
                  {propConfig.tips && (<ElTooltip placement="left-start" popper-class="max-w-200px" content={propConfig.tips}>
                      <div>
                        <ElIcon>
                          <Warning />
                        </ElIcon>
                      </div>
                    </ElTooltip>)}
                  {propConfig.label}
                </>),
                    default: () => renderPropItem(propName, propConfig),
                }}
          </ElFormItem>
        </>));
        };
    },
});
