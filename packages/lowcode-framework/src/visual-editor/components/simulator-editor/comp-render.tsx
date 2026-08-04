/*
 * @Author: 卜启缘
 * @Date: 2021-05-04 05:36:58
 * @LastEditTime: 2021-07-13 17:17:52
 * @LastEditors: 卜启缘
 * @Description:
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\simulator-editor\comp-render.tsx
 */
import { defineComponent, h, PropType } from 'vue';
import type { VisualEditorBlockData } from '../../visual-editor.utils';
import { visualConfig } from '../../../visual.config';

type DesignedBlockRenderer = (blocks: VisualEditorBlockData[], keySuffix?: string) => ReturnType<typeof h>[];
type ButtonContextmenuHandler = (
  event: MouseEvent,
  block: VisualEditorBlockData,
  buttonIndex: number,
) => void;

const CompRender = defineComponent({
  name: 'CompRender',
  props: {
    element: {
      type: Object as PropType<VisualEditorBlockData>,
      default: () => ({}),
    },
    onButtonContextmenu: {
      type: Function as PropType<ButtonContextmenuHandler>,
      default: undefined,
    },
  },
  setup(props) {
    return () =>
      visualConfig.componentMap[props.element.componentKey].render({
        styles: props.element.styles || {},
        props: props.element.props || {},
        model: {},
        block: props.element,
        custom: {
          renderDesignedBlock: (element: VisualEditorBlockData, keySuffix = '') =>
            renderDesignedBlock(element, keySuffix, props.onButtonContextmenu),
          renderDesignedBlocks: ((blocks: VisualEditorBlockData[], keySuffix = '') =>
            renderDesignedBlocks(
              blocks,
              keySuffix,
              props.onButtonContextmenu,
            )) as DesignedBlockRenderer,
          onButtonContextmenu: props.onButtonContextmenu
            ? (event: MouseEvent, buttonIndex: number) =>
                props.onButtonContextmenu?.(event, props.element, buttonIndex)
            : undefined,
        },
      })();
  },
});

function renderDesignedBlock(
  element: VisualEditorBlockData,
  keySuffix = '',
  onButtonContextmenu?: ButtonContextmenuHandler,
) {
  const slots = element.props?.slots || {};
  const slotRenderers = Object.keys(slots).reduce<Record<string, () => ReturnType<typeof h>[]>>(
    (prev, slotKey) => {
      prev[slotKey] = () =>
        (slots[slotKey]?.children || []).map((child) =>
          renderDesignedBlock(child, keySuffix, onButtonContextmenu),
        );
      return prev;
    },
    {},
  );

  return h(
    CompRender,
    {
      key: `${element._vid}${keySuffix}`,
      element,
      onButtonContextmenu,
    },
    slotRenderers,
  );
}

function renderDesignedBlocks(
  blocks: VisualEditorBlockData[],
  keySuffix = '',
  onButtonContextmenu?: ButtonContextmenuHandler,
) {
  return blocks.map((block) =>
    renderDesignedBlock(block, keySuffix, onButtonContextmenu),
  );
}

export default CompRender;
