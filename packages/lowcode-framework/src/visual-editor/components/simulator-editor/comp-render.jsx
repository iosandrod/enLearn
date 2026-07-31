/*
 * @Author: 卜启缘
 * @Date: 2021-05-04 05:36:58
 * @LastEditTime: 2021-07-13 17:17:52
 * @LastEditors: 卜启缘
 * @Description:
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\simulator-editor\comp-render.tsx
 */
import { defineComponent, h } from 'vue';
import { visualConfig } from '../../../visual.config';
const CompRender = defineComponent({
    name: 'CompRender',
    props: {
        element: {
            type: Object,
            default: () => ({}),
        },
    },
    setup(props) {
        return () => visualConfig.componentMap[props.element.componentKey].render({
            styles: props.element.styles || {},
            props: props.element.props || {},
            model: {},
            block: props.element,
            custom: {
                renderDesignedBlock,
                renderDesignedBlocks: renderDesignedBlocks,
            },
        })();
    },
});
function renderDesignedBlock(element, keySuffix = '') {
    const slots = element.props?.slots || {};
    const slotRenderers = Object.keys(slots).reduce((prev, slotKey) => {
        prev[slotKey] = () => (slots[slotKey]?.children || []).map((child) => renderDesignedBlock(child, keySuffix));
        return prev;
    }, {});
    return h(CompRender, {
        key: `${element._vid}${keySuffix}`,
        element,
    }, slotRenderers);
}
function renderDesignedBlocks(blocks, keySuffix = '') {
    return blocks.map((block) => renderDesignedBlock(block, keySuffix));
}
export default CompRender;
