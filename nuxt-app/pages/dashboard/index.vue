<template>
  <section class="manufacturing-workbench">
    <div class="workbench-header">
      <div>
        <p class="workbench-kicker">制造工作台</p>
        <h1>早上好，生产主管</h1>
        <p>聚焦待办审批、现场消息、核心生产指标和今日排程。</p>
      </div>
      <div class="shift-card">
        <span>当前班次</span>
        <strong>白班 08:00-20:00</strong>
        <small>3 条异常待确认</small>
      </div>
    </div>

    <div class="metric-grid">
      <article v-for="metric in productionMetrics" :key="metric.label" class="metric-card">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small :class="metric.trendType">{{ metric.trend }}</small>
      </article>
    </div>

    <div class="workbench-layout">
      <section class="workbench-panel approvals-panel">
        <div class="panel-heading">
          <div>
            <h2>我的审批</h2>
            <p>需要本人处理的生产与质量流程</p>
          </div>
          <button type="button">全部</button>
        </div>

        <div class="approval-list">
          <article v-for="approval in approvals" :key="approval.id" class="approval-item">
            <div>
              <strong>{{ approval.title }}</strong>
              <span>{{ approval.detail }}</span>
            </div>
            <em :class="approval.level">{{ approval.status }}</em>
          </article>
        </div>
      </section>

      <section class="workbench-panel">
        <div class="panel-heading">
          <div>
            <h2>消息中心</h2>
            <p>设备、质量、仓储实时提醒</p>
          </div>
          <button type="button">标记已读</button>
        </div>

        <ul class="message-list">
          <li v-for="messageItem in messages" :key="messageItem.title">
            <span :class="messageItem.type"></span>
            <div>
              <strong>{{ messageItem.title }}</strong>
              <small>{{ messageItem.time }}</small>
            </div>
          </li>
        </ul>
      </section>

      <section class="workbench-panel process-panel">
        <div class="panel-heading">
          <div>
            <h2>今日流程</h2>
            <p>关键制造流程进度</p>
          </div>
          <button type="button">刷新</button>
        </div>

        <div class="process-timeline">
          <article v-for="process in todayProcesses" :key="process.name">
            <span>{{ process.time }}</span>
            <div>
              <strong>{{ process.name }}</strong>
              <small>{{ process.owner }}</small>
            </div>
            <em :class="process.stateClass">{{ process.state }}</em>
          </article>
        </div>
      </section>

      <section class="workbench-panel task-panel">
        <div class="panel-heading">
          <div>
            <h2>任务安排</h2>
            <p>今日班组执行计划</p>
          </div>
          <button type="button">新建</button>
        </div>

        <div class="task-board">
          <article v-for="task in tasks" :key="task.name">
            <div>
              <strong>{{ task.name }}</strong>
              <span>{{ task.owner }} · {{ task.line }}</span>
            </div>
            <progress :value="task.progress" max="100"></progress>
            <small>{{ task.progress }}%</small>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
const productionMetrics = [
  { label: '今日计划达成', value: '92.4%', trend: '较昨日 +3.1%', trendType: 'good' },
  { label: '在制工单', value: '48', trend: '6 单临近交期', trendType: 'warn' },
  { label: '设备稼动率', value: '86.7%', trend: '2 台待保养', trendType: 'warn' },
  { label: '一次合格率', value: '98.2%', trend: '稳定达标', trendType: 'good' }
];

const approvals = [
  { id: 'A-1028', title: '制程变更申请', detail: '装配一线 · 扭矩标准调整', status: '待审批', level: 'urgent' },
  { id: 'A-1029', title: '设备停机维修', detail: 'CNC-07 主轴温升异常', status: '待确认', level: 'warn' },
  { id: 'A-1030', title: '物料替代申请', detail: 'BOM-M2407 缺料替代', status: '流转中', level: 'normal' }
];

const messages = [
  { title: '包装线产量低于节拍阈值', time: '10 分钟前', type: 'danger' },
  { title: '质检抽样批次 Q-240729 已完成', time: '25 分钟前', type: 'success' },
  { title: '原料仓 A 区库存低于安全线', time: '42 分钟前', type: 'warning' },
  { title: '夜班交接记录已提交', time: '08:15', type: 'info' }
];

const todayProcesses = [
  { time: '08:30', name: '班前点检', owner: '设备组 / 4 条产线', state: '已完成', stateClass: 'done' },
  { time: '10:00', name: '首件检验', owner: '质量部 / 装配一线', state: '进行中', stateClass: 'running' },
  { time: '14:00', name: '工单齐套复核', owner: '计划部 / 物控组', state: '待开始', stateClass: 'pending' },
  { time: '18:30', name: '生产入库确认', owner: '仓储部 / 成品库', state: '待开始', stateClass: 'pending' }
];

const tasks = [
  { name: 'M240729-01 电机组件装配', owner: '王工', line: '装配一线', progress: 76 },
  { name: 'M240729-02 外壳喷涂返修', owner: '李工', line: '涂装线', progress: 44 },
  { name: 'M240729-03 终检与入库', owner: '周工', line: '质检区', progress: 63 }
];
</script>

<style scoped>
.manufacturing-workbench {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.workbench-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.workbench-header h1 {
  margin: 0;
  color: #111827;
  font-size: 26px;
  line-height: 1.2;
}

.workbench-header p {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
}

.workbench-kicker {
  margin: 0 0 4px !important;
  color: #006be6 !important;
  font-weight: 700;
}

.shift-card,
.metric-card,
.workbench-panel {
  border: 1px solid #dde2e8;
  border-radius: 6px;
  background: #ffffff;
}

.shift-card {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 240px;
  padding: 14px 16px;
}

.shift-card span,
.shift-card small,
.metric-card span,
.metric-card small,
.approval-item span,
.message-list small,
.process-timeline small,
.task-board span,
.task-board small,
.panel-heading p {
  color: #667085;
  font-size: 12px;
}

.shift-card strong {
  color: #111827;
  font-size: 18px;
}

.metric-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 12px;
}

.metric-card {
  display: grid;
  gap: 6px;
  padding: 14px;
}

.metric-card strong {
  color: #111827;
  font-size: 26px;
  line-height: 1;
}

.good {
  color: #14804a !important;
}

.warn {
  color: #b54708 !important;
}

.workbench-layout {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
}

.workbench-panel {
  min-width: 0;
  padding: 14px;
}

.approvals-panel,
.process-panel {
  min-height: 260px;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-heading h2 {
  margin: 0;
  font-size: 16px;
}

.panel-heading p {
  margin: 4px 0 0;
}

.panel-heading button {
  height: 28px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  background: #ffffff;
  color: #344054;
  cursor: pointer;
  font-size: 12px;
  padding: 0 10px;
}

.approval-list,
.process-timeline,
.task-board {
  display: grid;
  gap: 8px;
}

.approval-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 4px;
  padding: 11px 12px;
}

.approval-item div,
.task-board div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.approval-item strong,
.task-board strong,
.message-list strong,
.process-timeline strong {
  color: #111827;
  font-size: 13px;
}

.approval-item em,
.process-timeline em {
  border-radius: 999px;
  flex: none;
  font-size: 12px;
  font-style: normal;
  padding: 3px 8px;
}

.urgent {
  background: #fff1f0;
  color: #cf1322;
}

.normal,
.pending {
  background: #f2f4f7;
  color: #475467;
}

.message-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
}

.message-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  list-style: none;
}

.message-list li > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.danger {
  background: #cf1322;
}

.success {
  background: #14804a;
}

.warning {
  background: #b54708;
}

.info {
  background: #006be6;
}

.message-list div {
  display: grid;
  gap: 3px;
}

.process-timeline article {
  display: grid;
  align-items: center;
  gap: 12px;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  border-bottom: 1px solid #eef2f6;
  padding: 8px 0;
}

.process-timeline article:last-child {
  border-bottom: 0;
}

.process-timeline article > span {
  color: #475467;
  font-size: 12px;
}

.done {
  background: #ecfdf3;
  color: #14804a;
}

.running {
  background: #eaf4ff;
  color: #006be6;
}

.task-board article {
  display: grid;
  gap: 8px;
  border: 1px solid #e4e7ec;
  border-radius: 4px;
  padding: 11px 12px;
}

.task-board progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: #eef2f6;
}

.task-board progress::-webkit-progress-bar {
  background: #eef2f6;
}

.task-board progress::-webkit-progress-value {
  background: #1677ff;
}

@media (max-width: 1080px) {
  .metric-grid,
  .workbench-layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .workbench-header,
  .metric-grid,
  .workbench-layout {
    grid-template-columns: 1fr;
  }

  .workbench-header {
    display: grid;
  }

  .shift-card {
    min-width: 0;
  }
}
</style>
