import assert from 'node:assert/strict';

import { selectAuthorizedNavigationRoutes } from './admin-navigation';

const rows = [
  {
    id: 'root',
    code: 'production',
    title: 'Production',
    path: '/production',
    route_type: 'group',
    permission_code: 'mes.production.view',
    visible: true,
    status: 'active',
    sort_order: 20
  },
  {
    id: 'orders',
    code: 'work-orders',
    title: 'Work orders',
    path: '/production/orders',
    parent_id: 'root',
    route_type: 'page',
    page_code: 'work-orders',
    permission_code: 'mes.orders.view',
    visible: true,
    status: 'active',
    sort_order: 10,
    metadata: { navigation: 'sidebar' }
  },
  {
    id: 'hidden',
    code: 'hidden-page',
    title: 'Hidden',
    path: '/hidden',
    route_type: 'page',
    page_code: 'hidden-page',
    visible: false,
    status: 'active'
  },
  {
    id: 'inactive',
    code: 'inactive-page',
    title: 'Inactive',
    path: '/inactive',
    route_type: 'page',
    page_code: 'inactive-page',
    visible: true,
    status: 'inactive'
  }
];

assert.deepEqual(
  selectAuthorizedNavigationRoutes(rows, ['mes.production.view', 'mes.orders.view']).map(
    (route) => route.id
  ),
  ['orders', 'root'],
  'visible active routes should be returned when the complete permission chain is available'
);

assert.deepEqual(
  selectAuthorizedNavigationRoutes(rows, ['mes.orders.view']).map((route) => route.id),
  [],
  'a permitted child must remain unavailable when its parent permission is missing'
);

assert.deepEqual(
  selectAuthorizedNavigationRoutes(rows, [], true).map((route) => route.id),
  ['orders', 'root'],
  'legacy administrators should bypass route permissions but not visibility or status'
);

assert.deepEqual(
  selectAuthorizedNavigationRoutes(rows, [], true, { includeHidden: true }).map(
    (route) => route.id
  ),
  ['hidden', 'orders', 'root'],
  'authorized runtime routes may include hidden entries without including inactive entries'
);

console.log('admin navigation tests passed');
