import { defineComponent } from 'vue';
import { DocumentChecked } from '../../../common/remix-icons';
import { visualConfig } from '../../../../../visual.config';
import MaterialPalette from '../../material-palette';

export default defineComponent({
  name: 'FormComponents',
  label: '表单组件',
  icon: DocumentChecked,
  order: 3.5,
  setup: () => () => (
    <MaterialPalette items={visualConfig.componentModules.formComponents} />
  ),
});
