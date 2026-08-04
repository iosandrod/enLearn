<template>
  <div id="root" class="app-shell">
    <div v-if="!isLoginPage" class="app-header">
      <div class="app-title-group">
        <span class="app-kicker">ENLEARN MOBILE</span>
        <span class="app-title">{{ pageTitle }}</span>
      </div>
      <span :class="['app-status', statusTone]">{{ statusLabel }}</span>
    </div>

    <div class="app-body">
      <router-view @page-title-change="setPageTitle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from '@vue/runtime-core';
import { useRoute } from '@hippy/vue-router-next-history';

const route = useRoute();
const runtimePageTitle = ref('');

const isLoginPage = computed(() => route.path === '/login');
const pageTitle = computed(() => runtimePageTitle.value || String(route.meta.title ?? '低代码应用'));
const statusLabel = computed(() => (__PLATFORM__ === 'web' ? 'WEB PREVIEW' : 'NATIVE'));
const statusTone = computed(() => (__PLATFORM__ === 'web' ? 'is-preview' : 'is-native'));

function setPageTitle(title: string) {
  runtimePageTitle.value = title.trim();
}

watch(() => route.path, () => {
  runtimePageTitle.value = '';
});
</script>

<style>
#root,
.app-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #eef1f4;
}

.app-header {
  min-height: 68px;
  padding-top: 10px;
  padding-right: 16px;
  padding-bottom: 10px;
  padding-left: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #dfe4e8;
}

.app-title-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-kicker {
  color: #68737d;
  font-size: 10px;
  line-height: 14px;
}

.app-title {
  color: #17212b;
  font-size: 20px;
  line-height: 28px;
  font-weight: bold;
}

.app-status {
  padding-top: 4px;
  padding-right: 8px;
  padding-bottom: 4px;
  padding-left: 8px;
  font-size: 10px;
  line-height: 14px;
  border-radius: 4px;
}

.app-status.is-preview {
  color: #7a4f00;
  background-color: #fff1cc;
}

.app-status.is-native {
  color: #0b644b;
  background-color: #d7f6e9;
}

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
</style>
