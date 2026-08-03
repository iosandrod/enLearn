<template>
  <KeepAlive :max="max">
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
import { computed, ref, watch, type VNode } from 'vue';

const props = defineProps<{
  routeComponent: VNode;
  keepAlive: boolean;
  cacheKey: string;
  routeKey: string;
  max: number;
}>();

const cachedRouteComponent = ref<VNode>();

watch(
  () => [props.keepAlive, props.routeComponent] as const,
  ([keepAlive, routeComponent]) => {
    if (keepAlive) cachedRouteComponent.value = routeComponent;
  },
  { immediate: true }
);

const activeCachedRouteComponent = computed(() =>
  props.keepAlive ? cachedRouteComponent.value : null
);
</script>
