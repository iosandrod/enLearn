<template>
  <div class="standalone-print-designer">
    <PrintDesignerPage />
  </div>
</template>

<script setup lang="ts">
// Reuse the backend-backed page renderer. The designer UI, materials and
// actions come from the `print-designer` low-code page schema at runtime.
import PrintDesignerPage from './dashboard/print/lowcode-designer.vue';
</script>

<style>
/* The standalone route owns the whole viewport instead of inheriting either
   the public site shell or the dashboard shell. */
html:has(.standalone-print-designer),
html:has(.standalone-print-designer) body,
html:has(.standalone-print-designer) #app {
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

.standalone-print-designer {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.standalone-print-designer .print-lowcode-page {
  height: 100%;
  min-height: 0;
}
</style>
