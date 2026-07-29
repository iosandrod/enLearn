<template>
  <section class="print-log-page">
    <header class="print-log-header">
      <h1>打印日志</h1>
    </header>

    <div class="print-log-table-shell">
      <table class="print-log-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>模板</th>
            <th>打印机</th>
            <th>状态</th>
            <th>页数</th>
            <th>消息</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="6" class="print-log-empty">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
</script>

<style scoped>
.print-log-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 8px;
}

.print-log-header,
.print-log-table-shell {
  border: 1px solid #d6dce5;
  border-radius: 6px;
  background: #ffffff;
}

.print-log-header {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 8px 12px;
}

.print-log-header h1 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 24px;
}

.print-log-table-shell {
  overflow: auto;
}

.print-log-table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
  color: #111827;
  font-size: 13px;
}

.print-log-table th,
.print-log-table td {
  border-bottom: 1px solid #e5eaf1;
  line-height: 20px;
  padding: 9px 12px;
  text-align: left;
  white-space: nowrap;
}

.print-log-table th {
  background: #f8fafc;
  font-weight: 750;
}

.print-log-empty {
  color: #94a3b8;
  text-align: center;
}
</style>
