import {
  createHippyRouter,
  type Router,
} from '@hippy/vue-router-next-history';

import RuntimePage from './pages/runtime-page.vue';
import LoginPage from './pages/login-page.vue';
import TableDemoPage from './pages/table-demo-page.vue';

export function createRouter(): Router {
  return createHippyRouter({
    routes: [
      {
        path: '/login',
        component: LoginPage,
        meta: {
          title: '登录',
        },
      },
      {
        path: '/',
        component: RuntimePage,
        meta: {
          title: '低代码运行时',
        },
      },
      {
        path: '/demo/table',
        component: TableDemoPage,
        meta: {
          title: '虚拟表格演示',
        },
      },
      {
        path: '/page/:code',
        component: RuntimePage,
        meta: {
          title: '业务页面',
        },
      },
    ],
  });
}
