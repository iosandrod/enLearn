import { defineComponent } from 'vue';
import { BarChart } from '../../../common/remix-icons';
import { visualConfig } from '../../../../../visual.config';
import MaterialPalette from '../../material-palette';

export default defineComponent({
  name: 'ChartComponent',
  label: '图表组件',
  icon: BarChart,
  order: 4.5,
  setup: () => () => (
    <MaterialPalette items={visualConfig.componentModules.chartComponents} />
  ),
});
