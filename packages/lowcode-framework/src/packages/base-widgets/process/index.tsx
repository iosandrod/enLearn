import { Progress } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
export default { key: 'process', moduleName: 'baseWidgets', label: 'Progress', preview: () => <Progress style="width:190px" percentage={50} />, render: ({ props, styles }) => () => <div style={styles}><Progress {...props} pivotText={props.pivotText || undefined} /></div> } as VisualEditorComponent;
