<template>
  <KeepAlive :max="max" :exclude="excludedCacheEntryNames">
    <component
      :is="activeCachedRouteComponent"
      v-if="activeCachedRouteComponent"
      :key="cacheKey"
      :route-component="routeComponent"
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
  type Component,
  type PropType,
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
let cacheEntryId = 0;

const excludedCacheEntryNames = computed(() => [...excludedCacheEntryNameSet]);
const activeCachedRouteComponent = computed(() =>
  props.keepAlive ? resolveCacheEntryComponent(props.cacheKey) : null
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
    excludedCacheEntryNameSet.delete(cacheEntryName);
  }
);

function resolveCacheEntryComponent(cacheKey: string) {
  let cacheEntry = cacheEntryComponents.get(cacheKey);
  if (!cacheEntry) {
    cacheEntry = markRaw(defineComponent({
      name: `RouteCacheEntry${++cacheEntryId}`,
      props: {
        routeComponent: {
          type: Object as PropType<VNode>,
          required: true,
        },
      },
      setup(entryProps) {
        return () => cloneVNode(entryProps.routeComponent);
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
    }
  }

  return cacheEntry;
}
</script>
