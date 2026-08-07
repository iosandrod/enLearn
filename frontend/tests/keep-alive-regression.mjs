import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  Comment,
  Fragment,
  KeepAlive,
  createRenderer,
  createVNode,
  defineComponent,
  h,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
} from 'vue';

function createHostNode(type, text = '') {
  return { type, text, children: [], parent: null, props: {} };
}

const renderer = createRenderer({
  patchProp(node, key, _previous, next) {
    node.props[key] = next;
  },
  insert(child, parent, anchor = null) {
    if (child.parent) {
      const previousIndex = child.parent.children.indexOf(child);
      if (previousIndex >= 0) child.parent.children.splice(previousIndex, 1);
    }

    child.parent = parent;
    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1;
    if (anchorIndex >= 0) parent.children.splice(anchorIndex, 0, child);
    else parent.children.push(child);
  },
  remove(child) {
    if (!child.parent) return;
    const index = child.parent.children.indexOf(child);
    if (index >= 0) child.parent.children.splice(index, 1);
    child.parent = null;
  },
  createElement: (type) => createHostNode(type),
  createText: (text) => createHostNode('#text', text),
  createComment: (text) => createHostNode('#comment', text),
  setText(node, text) {
    node.text = text;
  },
  setElementText(node, text) {
    node.text = text;
    node.children = [];
  },
  parentNode: (node) => node.parent,
  nextSibling(node) {
    if (!node.parent) return null;
    const index = node.parent.children.indexOf(node);
    return node.parent.children[index + 1] ?? null;
  },
});

function trackedPage(name, events) {
  return defineComponent({
    name,
    setup() {
      onMounted(() => events.push(`${name}:mounted`));
      onUnmounted(() => events.push(`${name}:unmounted`));
      onActivated(() => events.push(`${name}:activated`));
      onDeactivated(() => events.push(`${name}:deactivated`));
      return () => h('div', name);
    },
  });
}

const events = [];
const activeRoute = ref('regular');
const RegularPage = trackedPage('RegularPage', events);
const AdvancedPage = trackedPage('AdvancedPage', events);
const UncachedPage = trackedPage('UncachedPage', events);

const outletSource = await readFile(
  new URL('../components/RouteCacheOutlet.vue', import.meta.url),
  'utf8'
);
assert.match(
  outletSource,
  /<KeepAlive\s+:max="max"\s+:exclude="excludedCacheEntryNames">[\s\S]*v-if="activeCachedRouteComponent"[\s\S]*<\/KeepAlive>/,
  'KeepAlive must stay mounted while non-cacheable routes are rendered.'
);
assert.match(
  outletSource,
  /v-if="!keepAlive"/,
  'Non-cacheable routes must render outside the stable KeepAlive boundary.'
);
assert.match(
  outletSource,
  /if \(keepAlive\) cachedRouteComponent\.value = routeComponent/,
  'The cached route vnode must be retained while an uncached route is active.'
);
assert.match(
  outletSource,
  /name: `RouteCacheEntry\$\{\+\+cacheEntryId\}`/,
  'Each cached route must use a uniquely named wrapper so it can be evicted independently.'
);
assert.match(
  outletSource,
  /excludedCacheEntryNameSet\.add\(cacheEntryName\);\s*await nextTick\(\);[\s\S]*excludedCacheEntryNameSet\.delete\(cacheEntryName\)/,
  'A cache invalidation must exclude the selected route long enough for KeepAlive to prune it.'
);

const appSource = await readFile(new URL('../app.vue', import.meta.url), 'utf8');
assert.match(
  appSource,
  /return `\$\{accountCacheScope\.value\}:\$\{path\}:v\$\{version\}`/,
  'Cached route keys must include their invalidation version.'
);
assert.match(
  appSource,
  /:cache-invalidation="routeCacheInvalidation"/,
  'The cache outlet must receive targeted invalidation requests.'
);

const routerSource = await readFile(new URL('../src/router.ts', import.meta.url), 'utf8');
const advancedCachedRoutes = [
  '/dashboard/trigger-workflow/designer',
  '/dashboard/advanced/print-designer',
  '/dashboard/print-designer',
  '/dashboard/low-code/designer/:code?',
  '/dashboard/workflow/designer/:code?',
  '/dashboard/entity-design',
  '/dashboard/files',
];

for (const routePath of advancedCachedRoutes) {
  const routeLine = routerSource
    .split(/\r?\n/)
    .find((line) => line.includes(`path: '${routePath}'`));
  assert.ok(routeLine, `Advanced route ${routePath} must be registered.`);
  assert.match(
    routeLine,
    /meta: dashboardCachedRouteMeta/,
    `Advanced route ${routePath} must opt into KeepAlive.`
  );
}

const App = defineComponent({
  setup() {
    const cachedPage = () => {
      if (activeRoute.value === 'regular') {
        return h(RegularPage, { key: '/dashboard/sales-orders' });
      }
      if (activeRoute.value === 'advanced') {
        return h(AdvancedPage, { key: '/dashboard/entity-design' });
      }
      return createVNode(Comment);
    };

    return () => h(Fragment, null, [
      h(KeepAlive, { max: 8 }, cachedPage),
      activeRoute.value === 'uncached' ? h(UncachedPage) : createVNode(Comment),
    ]);
  },
});

const app = renderer.createApp(App);
app.mount(createHostNode('root'));
await nextTick();

activeRoute.value = 'advanced';
await nextTick();
activeRoute.value = 'regular';
await nextTick();
activeRoute.value = 'advanced';
await nextTick();
activeRoute.value = 'uncached';
await nextTick();
activeRoute.value = 'regular';
await nextTick();

assert.equal(
  events.filter((event) => event === 'RegularPage:mounted').length,
  1,
  'The regular page must not mount again after visiting an advanced route.'
);
assert.equal(
  events.filter((event) => event === 'AdvancedPage:mounted').length,
  1,
  'The advanced page must not mount again after returning from a regular route.'
);
assert.equal(
  events.filter((event) => event === 'RegularPage:unmounted').length,
  0,
  'The regular page must remain cached while another route is active.'
);
assert.equal(
  events.filter((event) => event === 'AdvancedPage:unmounted').length,
  0,
  'The advanced page must remain cached while another route is active.'
);
assert.deepEqual(events, [
  'RegularPage:mounted',
  'RegularPage:activated',
  'RegularPage:deactivated',
  'AdvancedPage:mounted',
  'AdvancedPage:activated',
  'AdvancedPage:deactivated',
  'RegularPage:activated',
  'RegularPage:deactivated',
  'AdvancedPage:activated',
  'AdvancedPage:deactivated',
  'UncachedPage:mounted',
  'RegularPage:activated',
  'UncachedPage:unmounted',
]);

app.unmount();
console.log('KeepAlive regular and advanced route regression test passed.');
