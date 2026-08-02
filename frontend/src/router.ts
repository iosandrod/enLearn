import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const dashboardRouteMeta = { layout: 'dashboard', auth: true };
const dashboardLowCodeRouteMeta = { ...dashboardRouteMeta, keepAlive: true };

function resolveDashboardLowCodeRouteProps(route: { params: Record<string, unknown> }) {
  const raw = Array.isArray(route.params.slug)
    ? route.params.slug.join('/')
    : String(route.params.slug ?? '');

  return {
    routePath: `/dashboard/${raw}`.replace(/\/+$/, ''),
  };
}

const publicRoutes: RouteRecordRaw[] = [
  { path: '/', component: () => import('../pages/index.vue') },
  { path: '/pricing', component: () => import('../pages/pricing.vue') },
  { path: '/signin', component: () => import('../pages/signin.vue'), meta: { layout: false, guest: true } },
  { path: '/signup', component: () => import('../pages/signup.vue'), meta: { layout: false, guest: true } },
  { path: '/auth/callback', component: () => import('../pages/auth/callback.vue'), meta: { layout: false } },
  { path: '/blog', component: () => import('../pages/blog/index.vue') },
  { path: '/blog/:slug', component: () => import('../pages/blog/[slug].vue') },
  { path: '/docs', component: () => import('../pages/docs/index.vue') },
  { path: '/docs/:slug(.*)*', component: () => import('../pages/docs/[...slug].vue') },
];

const dashboardRoutes: RouteRecordRaw[] = [
  { path: '/dashboard', component: () => import('../pages/dashboard/index.vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/trigger-workflow/designer', component: () => import('../pages/dashboard/trigger-workflow/designer.vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/advanced/print-designer', component: () => import('../pages/dashboard/advanced/print-designer.vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/print-designer', component: () => import('../pages/dashboard/advanced/print-designer.vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/low-code/designer/:code?', component: () => import('../pages/dashboard/low-code/designer/[code].vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/workflow/designer/:code?', component: () => import('../pages/dashboard/workflow/designer.vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/entity-design', component: () => import('../pages/dashboard/entity-design.vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/files', component: () => import('../pages/dashboard/files.vue'), meta: dashboardRouteMeta },
  {
    path: '/dashboard/:slug(.*)*',
    component: () => import('../pages/dashboard/[...slug].vue'),
    meta: dashboardLowCodeRouteMeta,
    props: resolveDashboardLowCodeRouteProps,
  },
];

const routes: RouteRecordRaw[] = [...publicRoutes, ...dashboardRoutes];

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
