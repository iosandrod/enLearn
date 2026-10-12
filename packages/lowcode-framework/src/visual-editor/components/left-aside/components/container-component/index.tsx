import { defineComponent } from 'vue';
import { Suitcase } from '../../../common/remix-icons';
import { visualConfig } from '../../../../../visual.config';
import MaterialPalette from '../../material-palette';

export default defineComponent({
  name: 'ContainerComponent',
  label: '容器组件',
  icon: Suitcase,
  order: 4,
  setup: () => () => (
    <MaterialPalette items={visualConfig.componentModules.containerComponents} />
  ),
});
