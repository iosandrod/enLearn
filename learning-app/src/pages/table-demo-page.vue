<template>
  <div class="table-demo-screen">
    <MobilePageRenderer
      :page="demoPage"
      :service-api="serviceApi"
      @page-title-change="forwardPageTitle"
    />
  </div>
</template>

<script setup lang="ts">
import MobilePageRenderer from '../runtime/mobile-page-renderer.vue';
import { createDemoPage } from '../runtime/demo-page';
import { createMobileServiceApi } from '../runtime/service-api';

const emit = defineEmits<{
  pageTitleChange: [title: string];
}>();
const demoPage = createDemoPage();
const serviceApi = createMobileServiceApi();

function forwardPageTitle(title: string) {
  emit('pageTitleChange', title);
}
</script>

<style scoped>
.table-demo-screen {
  flex: 1;
  display: flex;
  min-height: 0;
}
</style>
