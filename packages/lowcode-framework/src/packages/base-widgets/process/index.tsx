/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-12 22:18:48
 * @LastEditTime: 2021-07-13 17:14:47
 * @LastEditors: 鍗滃惎缂?
 * @Description: 杩涘害鏉?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\process\index.tsx
 */
import { Progress } from '../../../components/VantFree';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorColorProp,
  createEditorSwitchProp,
  createEditorInputProp,
  createEditorInputNumberProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'process',
  moduleName: 'baseWidgets',
  label: '杩涘害鏉?,
  preview: () => <Progress style="width:190px" percentage={50} />,
  render: ({ props, styles }) => {
    const RenderProgress = () => <Progress {...props} pivotText={props.pivotText || undefined} />;

    return () => (
      <div style={styles}>
        <RenderProgress />
      </div>
    );
  },
  props: {
    percentage: createEditorInputNumberProp({ label: '杩涘害鐧惧垎姣?, defaultValue: 50 }),
    strokeWidth: createEditorInputNumberProp({ label: '绾挎潯绮楃粏', defaultValue: 5 }),
    inactive: createEditorSwitchProp({ label: '鏄惁缃伆', defaultValue: false }),
    color: createEditorColorProp({ label: '杩涘害鏉￠鑹?, defaultValue: '#1989fa' }),
    trackColor: createEditorColorProp({ label: '杞ㄩ亾棰滆壊', defaultValue: '#e5e5e5' }),
    pivotText: createEditorInputProp({ label: '杩涘害鏂囧瓧鍐呭' }),
    pivotColor: createEditorColorProp({ label: '杩涘害鏂囧瓧鑳屾櫙鑹?, defaultValue: '#1989fa' }),
    textColor: createEditorColorProp({ label: '杩涘害鏂囧瓧棰滆壊', defaultValue: '#ffffff' }),
    showPivot: createEditorSwitchProp({ label: '鏄惁鏄剧ず杩涘害鏂囧瓧', defaultValue: true }),
  },
} as VisualEditorComponent;
