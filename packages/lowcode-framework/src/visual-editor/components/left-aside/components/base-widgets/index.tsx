import { defineComponent } from 'vue';
import { Edit } from '../../../common/remix-icons';
import { visualConfig } from '../../../../../visual.config';
import MaterialPalette from '../../material-palette';

export default defineComponent({
  name: 'BaseWidgets',
  label: '基本组件',
  icon: Edit,
  order: 3,
  setup: () => () => (
    <MaterialPalette
      items={visualConfig.componentModules.baseWidgets}
      renderPreview={false}
    />
  ),
});
