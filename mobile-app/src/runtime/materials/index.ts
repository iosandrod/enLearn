import MobileActionGroup from './mobile-action-group.vue';
import MobileContainer from './mobile-container.vue';
import MobileDetail from './mobile-detail.vue';
import MobileForm from './mobile-form.vue';
import MobileGrid from './mobile-grid.vue';
import MobileSection from './mobile-section.vue';
import MobileStatCard from './mobile-stat-card.vue';
import MobileTabs from './mobile-tabs.vue';
import MobileText from './mobile-text.vue';
import MobileModal from './mobile-modal.vue';
import MobileDrawer from './mobile-drawer.vue';
import MobileTree from './mobile-tree.vue';
import { registerMobileMaterial } from '../material-registry';

let registered = false;

export function registerDefaultMobileMaterials() {
  if (registered) return;
  registered = true;

  [
    { type: 'text', component: MobileText },
    { type: 'container', component: MobileContainer },
    { type: 'section', component: MobileSection },
    { type: 'form', component: MobileForm },
    { type: 'searchForm', component: MobileForm },
    { type: 'grid', component: MobileGrid },
    { type: 'detail', component: MobileDetail },
    { type: 'statCard', component: MobileStatCard },
    { type: 'tabs', component: MobileTabs },
    { type: 'toolbar', component: MobileActionGroup },
    { type: 'buttonGroup', component: MobileActionGroup },
    { type: 'modal', component: MobileModal },
    { type: 'drawer', component: MobileDrawer },
    { type: 'tree', component: MobileTree },
  ].forEach((material) => {
    registerMobileMaterial({
      ...material,
      materialVersion: '1.0.0',
    });
  });
}
