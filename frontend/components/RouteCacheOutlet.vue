<template>
  <KeepAlive :max="max" :exclude="excludedCacheEntryNames">
    <component
      :is="activeCachedRouteComponent"
      v-if="activeCachedRouteComponent"
      :key="cacheKey"
    />
  </KeepAlive>
  <component
    :is="routeComponent"
    v-if="!keepAlive"
    :key="routeKey"
  />
</template>

<script setup lang="ts">
import {
  cloneVNode,
  computed,
  defineComponent,
  markRaw,
  nextTick,
  reactive,
  shallowReactive,
  type Component,
  type VNode,
  watch,
} from 'vue';

const props = defineProps<{
  routeComponent: VNode;
  keepAlive: boolean;
  cacheKey: string;
  cacheInvalidation: { id: number; cacheKey: string } | null;
  routeKey: string;
  max: number;
}>();

const cacheEntryComponents = new Map<string, Component>();
const cacheEntryKeys = new Set<string>();
const excludedCacheEntryNameSet = reactive(new Set<string>());
const cachedRouteComponents = shallowReactive(new Map<string, VNode>());
let cacheEntryId = 0;

const excludedCacheEntryNames = computed(() => [...excludedCacheEntryNameSet]);
const activeCachedRouteComponent = computed(() =>
  props.keepAlive ? resolveCacheEntryComponent(props.cacheKey) : null
);

watch(
  () => [props.keepAlive, props.cacheKey, props.routeComponent] as const,
  ([keepAlive, cacheKey, routeComponent]) => {
    if (keepAlive && routeComponent) cachedRouteComponents.set(cacheKey, routeComponent);
  },
  { immediate: true }
);

watch(
  () => props.cacheInvalidation,
  async (request) => {
    if (!request) return;
    const cacheEntry = cacheEntryComponents.get(request.cacheKey);
    const cacheEntryName = typeof cacheEntry?.name === 'string' ? cacheEntry.name : '';
    if (!cacheEntryName) return;

    excludedCacheEntryNameSet.add(cacheEntryName);
    await nextTick();
    cacheEntryComponents.delete(request.cacheKey);
    cacheEntryKeys.delete(request.cacheKey);
    cachedRouteComponents.delete(request.cacheKey);
    excludedCacheEntryNameSet.delete(cacheEntryName);
  }
);

function resolveCacheEntryComponent(cacheKey: string) {
  let cacheEntry = cacheEntryComponents.get(cacheKey);
  if (!cacheEntry) {
    cacheEntry = markRaw(defineComponent({
      name: `RouteCacheEntry${++cacheEntryId}`,
      setup() {
        return () => {
          const routeComponent = cachedRouteComponents.get(cacheKey);
          return routeComponent ? cloneVNode(routeComponent) : null;
        };
      },
    }));
    cacheEntryComponents.set(cacheKey, cacheEntry);
  }

  cacheEntryKeys.delete(cacheKey);
  cacheEntryKeys.add(cacheKey);
  if (props.max > 0 && cacheEntryKeys.size > props.max) {
    const oldestKey = cacheEntryKeys.values().next().value as string | undefined;
    if (oldestKey) {
      cacheEntryKeys.delete(oldestKey);
      cacheEntryComponents.delete(oldestKey);
      cachedRouteComponents.delete(oldestKey);
    }
  }

  return cacheEntry;
}
</script>
