import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('../pages/index.vue') },
  { path: '/pricing', component: () => import('../pages/pricing.vue') },
  { path: '/signin', component: () => import('../pages/signin.vue'), meta: { layout: false, guest: true } },
  { path: '/signup', component: () => import('../pages/signup.vue'), meta: { layout: false, guest: true } },
  { path: '/auth/callback', component: () => import('../pages/auth/callback.vue'), meta: { layout: false } },
  { path: '/blog', component: () => import('../pages/blog/index.vue') },
  { path: '/blog/:slug', component: () => import('../pages/blog/[slug].vue') },
  { path: '/docs', component: () => import('../pages/docs/index.vue') },
  { path: '/docs/:slug(.*)*', component: () => import('../pages/docs/[...slug].vue') },
  { path: '/dashboard', component: () => import('../pages/dashboard/index.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/account', component: () => import('../pages/dashboard/account.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/advanced/print-designer', component: () => import('../pages/dashboard/advanced/print-designer.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/entity-design', component: () => import('../pages/dashboard/entity-design.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/files', component: () => import('../pages/dashboard/files.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/low-code', component: () => import('../pages/dashboard/low-code/index.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/low-code/designer', component: () => import('../pages/dashboard/low-code/designer/index.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/low-code/designer/:code', component: () => import('../pages/dashboard/low-code/designer/[code].vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/low-code/:code', component: () => import('../pages/dashboard/low-code/[code].vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/messages', component: () => import('../pages/dashboard/messages.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/notification-deliveries', component: () => import('../pages/dashboard/notification-deliveries.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/print/logs', component: () => import('../pages/dashboard/print/logs.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/print-designer', component: () => import('../pages/dashboard/print-designer.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/settings', component: () => import('../pages/dashboard/settings.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/trigger-workflow/designer', component: () => import('../pages/dashboard/trigger-workflow/designer.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/workflow/designer', component: () => import('../pages/dashboard/workflow/designer.vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/workflow/designer/:code', component: () => import('../pages/dashboard/workflow/designer/[code].vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/workflow/tasks/:taskId', component: () => import('../pages/dashboard/workflow/tasks/[taskId].vue'), meta: { layout: 'dashboard', auth: true } },
  { path: '/dashboard/:slug(.*)*', component: () => import('../pages/dashboard/[...slug].vue'), meta: { layout: 'dashboard', auth: true } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const auth = useAuth();

  if (to.meta.auth) {
    await auth.init();
    if (!auth.user.value) return '/signin';
  }

  if (to.meta.guest) {
    await auth.init();
    if (auth.user.value) return '/dashboard';
  }
});
