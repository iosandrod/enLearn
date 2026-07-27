<script setup lang="ts">
import type { ApprovalTimelineEvent } from '../types/task';

defineProps<{
  events?: ApprovalTimelineEvent[];
}>();
</script>

<template>
  <ol class="approval-timeline" aria-label="审批时间线">
    <li v-for="event in events" :key="event.id" class="approval-timeline__event">
      <span class="approval-timeline__dot" />
      <div>
        <strong>{{ event.title }}</strong>
        <p v-if="event.comment">{{ event.comment }}</p>
        <small>
          {{ event.operatorName || event.eventType }}
          <template v-if="event.createdAt"> · {{ event.createdAt }}</template>
        </small>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.approval-timeline {
  display: grid;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.approval-timeline__event {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  color: #1f2937;
}

.approval-timeline__dot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 999px;
  background: #0f766e;
}

.approval-timeline__event p {
  margin: 4px 0;
  color: #475569;
}

.approval-timeline__event small {
  color: #64748b;
}
</style>
