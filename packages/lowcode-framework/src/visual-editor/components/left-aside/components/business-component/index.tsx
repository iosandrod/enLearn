import { defineComponent } from 'vue';
import { DataBoard } from '../../../common/remix-icons';
import { visualConfig } from '../../../../../visual.config';
import MaterialPalette from '../../material-palette';

export default defineComponent({
  name: 'BusinessComponent',
  label: '业务组件',
  icon: DataBoard,
  order: 5,
  setup: () => () => (
    <MaterialPalette items={visualConfig.componentModules.businessComponents} />
  ),
});
