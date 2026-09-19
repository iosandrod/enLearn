import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const dashboardRouteMeta = { layout: 'dashboard', auth: true, keepAlive: true };
const dashboardCachedRouteMeta = { ...dashboardRouteMeta, keepAlive: true };

function resolveDashboardLowCodeRouteProps(route: { params: Record<string, unknown> }) {
  const raw = Array.isArray(route.params.slug)
    ? route.params.slug.join('/')
    : String(route.params.slug ?? '');

  return {
    routePath: `/dashboard/${raw}`.replace(/\/+$/, ''),
  };
}

const publicRoutes: RouteRecordRaw[] = [
  // The root entry point introduces the schema-backed print designer. Keep
  // the original public homepage available at /home for compatibility.
  { path: '/', component: () => import('../pages/print-designer-landing.vue'), meta: { keepAlive: false } },
  { path: '/print-designer', component: () => import('../pages/print-designer.vue'), meta: { layout: false, keepAlive: false } },
  { path: '/home', component: () => import('../pages/index.vue') },
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
  // Entity designer is a code-backed workspace. Keep it ahead of the catch-all
  // low-code route so `/dashboard/entity-design` does not get rendered as a
  // database page (which can be empty when its page definition is unavailable).
  { path: '/dashboard/entity-design', component: () => import('../pages/dashboard/entity-design.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/trigger-workflow/designer', component: () => import('../pages/dashboard/trigger-workflow/lowcode-designer.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/advanced/print-designer', component: () => import('../pages/dashboard/print/lowcode-designer.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/print-designer', component: () => import('../pages/dashboard/print/lowcode-designer.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/low-code/designer/:code?', component: () => import('../pages/dashboard/low-code/designer/[code].vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/workflow/designer/:code?', component: () => import('../pages/dashboard/workflow/lowcode-designer.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/workflow/tasks/:taskId', component: () => import('../pages/dashboard/workflow/tasks/[taskId].vue'), meta: dashboardRouteMeta },
  { path: '/dashboard/approval/console', component: () => import('../pages/dashboard/approval/console.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/task/console', component: () => import('../pages/dashboard/task/console.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/account', component: () => import('../pages/dashboard/account.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/settings', component: () => import('../pages/dashboard/settings.vue'), meta: dashboardCachedRouteMeta },
  { path: '/dashboard/files', component: () => import('../pages/dashboard/files.vue'), meta: dashboardCachedRouteMeta },
  {
    path: '/dashboard/:slug(.*)*',
    component: () => import('../pages/dashboard/[...slug].vue'),
    meta: dashboardCachedRouteMeta,
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
    if (!auth.user.value || !auth.activeAccount.value) return '/signin';
  }

  if (to.meta.guest) {
    await auth.init();
    if (auth.user.value && auth.activeAccount.value) return '/dashboard';
  }
});
