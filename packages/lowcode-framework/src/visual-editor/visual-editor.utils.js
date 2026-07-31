import { inject, provide } from 'vue';
import { useDotProp } from './hooks/useDotProp';
import { generateNanoid } from './utils';
export function createNewBlock(component) {
    return {
        _vid: `vid_${generateNanoid()}`,
        moduleName: component.moduleName,
        componentKey: component.key,
        label: component.label,
        adjustPosition: true,
        focus: false,
        styles: {
            display: 'flex',
            justifyContent: 'flex-start',
            paddingTop: '0',
            paddingRight: '0',
            paddingLeft: '0',
            paddingBottom: '0',
            tempPadding: '0',
            ...(component.styles || {}),
        },
        hasResize: false,
    props: Object.entries(component.props || {}).reduce((prev, [propName, propSchema]) => {
        const { propObj, prop, isDotProp } = useDotProp(prev, propName);
        if (propSchema?.defaultValue) {
            propObj[prop] = propSchema?.defaultValue;
            if (!isDotProp) {
                prev[propName] = propSchema?.defaultValue;
            }
        }
        return prev;
    }, {}),
        draggable: component.draggable ?? true, // 是否可以拖拽
        showStyleConfig: component.showStyleConfig ?? true, // 是否显示组件样式配置
        animations: [], // 动画集
        actions: [], // 动作集合
        events: component.events || [], // 事件集合
        model: {},
    };
}
export const VisualDragProvider = (() => {
    const VISUAL_DRAG_PROVIDER = '@@VISUAL_DRAG_PROVIDER';
    return {
        provide: (data) => {
            provide(VISUAL_DRAG_PROVIDER, data);
        },
        inject: () => {
            return inject(VISUAL_DRAG_PROVIDER);
        },
    };
})();
/**
 * @description 创建编辑器配置
 * @returns {} 返回编辑器注册组件的方法等
 */
export function createVisualEditorConfig() {
    const componentModules = {
        baseWidgets: [],
        formComponents: [],
        containerComponents: [],
        businessComponents: [],
        chartComponents: [],
    };
    // const componentList: VisualEditorComponent[] = []
    const componentMap = {};
    return {
        componentModules,
        componentMap,
        registry: (moduleName, key, component) => {
            const comp = { ...component, key, moduleName };
            componentModules[moduleName].push(comp);
            componentMap[key] = comp;
        },
    };
}
