<template>
  <div class="print-intro">
    <section class="print-intro__hero">
      <div class="print-intro__hero-inner">
        <div class="print-intro__copy">
          <p class="print-intro__eyebrow"><span class="print-intro__eyebrow-dot"></span>PRINT DESIGNER / 01</p>
          <h1>把灵感和数据，<br /><em>变成可批量出图的作品。</em></h1>
          <p class="print-intro__lead">
            一个面向多场景的可视化设计器：从海报、标签到数据化内容与批量打印，
            用组件化画布组织视觉，用数据源驱动内容，再通过自动化流程持续出图。
          </p>
          <div class="print-intro__actions">
            <RouterLink class="print-intro__primary" to="/print-designer">
              <i class="ri-pencil-ruler-2-line" aria-hidden="true"></i>
              进入打印设计器
              <i class="ri-arrow-right-line" aria-hidden="true"></i>
            </RouterLink>
            <a class="print-intro__secondary" href="#capabilities">了解能力 <i class="ri-arrow-down-line" aria-hidden="true"></i></a>
          </div>
          <div class="print-intro__meta" aria-label="设计器特性">
            <span><i class="ri-drag-move-2-line" aria-hidden="true"></i>多样组件创作</span>
            <span><i class="ri-database-2-line" aria-hidden="true"></i>数据源绑定</span>
            <span><i class="ri-magic-line" aria-hidden="true"></i>AI 制图协同</span>
            <span><i class="ri-loop-right-line" aria-hidden="true"></i>自动化出图</span>
          </div>
        </div>

        <div id="designer-preview" class="print-intro__preview print-intro__preview--real" aria-label="真实打印设计器画布">
          <TldrawVue :show-template-controls="false" />
        </div>
      </div>
    </section>

    <section id="capabilities" class="print-intro__capabilities">
      <div class="print-intro__section-heading"><p>WHY PRINT DESIGNER</p><h2>从灵感到成片，<br />每一种视觉都能被复用。</h2><span>让设计组件、业务数据和自动化任务在同一套模板体系里协作，持续产出海报、标签、数据图和批量打印内容。</span></div>
      <div class="print-intro__capability-grid">
        <article v-for="(item, index) in capabilities" :key="item.title" class="capability-card">
          <span class="capability-card__index">0{{ index + 1 }}</span><i :class="item.icon" aria-hidden="true"></i><h3>{{ item.title }}</h3><p>{{ item.description }}</p><span class="capability-card__line"></span>
        </article>
      </div>
    </section>

    <section id="start-design" class="print-intro__cta">
      <div><p>READY TO DESIGN</p><h2>从一个创意，开始持续出图。</h2></div>
      <RouterLink class="print-intro__primary print-intro__primary--light" to="/print-designer">打开设计器 <i class="ri-arrow-right-line" aria-hidden="true"></i></RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import TldrawVue from 'tldraw-vue-phase-one';

const capabilities = [
  { title: '多样化创作', icon: 'ri-shapes-line', description: '文本、图形、图片、表格与业务组件自由组合，覆盖海报、标签、数据图等视觉场景。' },
  { title: '数据源绑定', icon: 'ri-database-2-line', description: '连接业务数据源，让标题、图片、列表和统计内容随数据实时生成。' },
  { title: '批量打印', icon: 'ri-printer-cloud-line', description: '一次选择多条数据，自动套用模板批量输出，适配不同尺寸和打印介质。' },
  { title: 'AI 制图协同', icon: 'ri-sparkling-2-line', description: '让 AI 参与构图、素材和视觉变体探索，加速从想法到可用画面的过程。' },
  { title: '自动化出图', icon: 'ri-loop-right-line', description: '把设计模板接入任务流程，按事件、计划或数据变化自动生成内容。' },
  { title: '模板管理与保存', icon: 'ri-stack-line', description: '集中保存模板、维护版本和复用组件，让团队始终使用一致的视觉标准。' },
];
</script>

<style scoped>
.print-intro { --ink: #152238; --muted: #657286; --line: #d9e0e8; --paper: #f5f7fa; --accent: #e35f37; --mint: #d9f0e8; margin-top: 68px; color: var(--ink); background: #f8fafb; }
.print-intro :is(#designer-preview, #capabilities, #start-design) { scroll-margin-top: 84px; }
.print-intro__hero { overflow: hidden; background: #eef3f5; border-bottom: 1px solid var(--line); }
.print-intro__hero-inner { display: grid; grid-template-columns: minmax(0, 1fr); gap: 54px; max-width: 1600px; min-height: auto; margin: 0 auto; padding: 78px clamp(24px, 5vw, 72px) 84px; }
.print-intro__copy { max-width: 900px; }
.print-intro__eyebrow, .print-intro__section-heading > p, .print-intro__cta p { margin: 0 0 24px; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: 1.8px; }
.print-intro__eyebrow-dot { display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; background: var(--accent); vertical-align: 1px; }
h1 { margin: 0; font-size: clamp(48px, 5.2vw, 80px); line-height: 1.04; letter-spacing: -.8px; font-weight: 750; }
h1 em { color: var(--accent); font-style: normal; }
.print-intro__lead { max-width: 510px; margin: 30px 0 0; color: var(--muted); font-size: 16px; line-height: 1.9; }
.print-intro__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; margin-top: 36px; }
.print-intro__primary { display: inline-flex; align-items: center; gap: 11px; min-height: 52px; padding: 0 22px; border-radius: 4px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 750; box-shadow: 0 10px 18px rgb(227 95 55 / 18%); transition: transform .2s ease, box-shadow .2s ease; }
.print-intro__primary:hover { transform: translateY(-2px); box-shadow: 0 14px 24px rgb(227 95 55 / 26%); }
.print-intro__secondary { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 13px; font-weight: 700; }
.print-intro__secondary i { color: var(--accent); }
.print-intro__meta { display: flex; flex-wrap: wrap; gap: 18px 24px; margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.print-intro__meta span { display: inline-flex; align-items: center; gap: 7px; }.print-intro__meta i { color: #32866f; font-size: 16px; }
.print-intro__preview { border: 1px solid #c8d2dc; border-radius: 7px; background: #dfe6eb; box-shadow: 18px 22px 40px rgb(25 48 65 / 14%); transform: rotate(1.2deg); }
.print-intro__preview--real { width: 100%; height: 720px; overflow: hidden; transform: none; }
.print-intro__preview--real :deep(.app-shell),
.print-intro__preview--real :deep(.editor-host) { height: 100%; min-height: 0; }
/* The landing page exposes the actual canvas and side panels; template and
   navigation commands remain available on the full designer route. */
.preview-toolbar { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 14px; border-bottom: 1px solid #c5cfd8; color: #6f7c89; font-size: 10px; letter-spacing: .5px; }.preview-toolbar__dots { display: flex; gap: 5px; }.preview-toolbar__dots i { width: 7px; height: 7px; border-radius: 50%; background: #b8c3cc; }.preview-toolbar__status { display: inline-flex; align-items: center; gap: 5px; }.preview-toolbar__status i { width: 5px; height: 5px; border-radius: 50%; background: #3c9a76; }
.preview-workspace { display: grid; grid-template-columns: 84px minmax(300px, 1fr) 112px; min-height: 470px; }.preview-sidebar, .preview-properties { padding: 18px 10px; background: #f3f6f8; }.preview-sidebar { border-right: 1px solid #cbd5dd; }.preview-properties { border-left: 1px solid #cbd5dd; }.preview-label { display: block; margin-bottom: 15px; color: #7c8996; font-size: 9px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }.preview-tool { display: grid; place-items: center; gap: 5px; min-height: 55px; margin-bottom: 6px; border: 1px solid transparent; border-radius: 4px; color: #687685; font-size: 10px; }.preview-tool:first-of-type { border-color: #bcd6ca; background: #e5f2eb; color: #2b795e; }.preview-tool i { font-size: 19px; }.preview-canvas-wrap { display: grid; place-items: center; padding: 27px 24px; background: #d5dde3; }.preview-canvas { position: relative; width: min(100%, 370px); aspect-ratio: .72; padding: 25px 23px; overflow: hidden; background: #fff; box-shadow: 0 6px 14px rgb(33 50 67 / 15%); color: #263442; }.paper-heading { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 7px; }.paper-heading span { color: #388269; font-size: 10px; font-weight: 800; letter-spacing: 1px; }.paper-heading strong { grid-column: 1 / -1; font-size: 18px; letter-spacing: .5px; }.paper-heading small { grid-column: 1 / -1; color: #8a98a6; font-size: 8px; }.paper-rule { height: 2px; margin: 16px 0 13px; background: #283a49; }.paper-fields { display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px; margin-bottom: 16px; color: #8b98a3; font-size: 8px; }.paper-fields b { display: block; margin-top: 4px; color: #374958; font-size: 9px; font-weight: 650; }.paper-table { border: 1px solid #dce2e7; font-size: 8px; }.paper-table__head, .paper-table__row { display: grid; grid-template-columns: 1fr 1.5fr .55fr .45fr; }.paper-table__head { background: #edf2f4; color: #536474; font-weight: 750; }.paper-table__head span, .paper-table__row span { padding: 8px 5px; border-right: 1px solid #dce2e7; border-bottom: 1px solid #e4e8eb; }.paper-table__row { color: #687785; }.paper-table__row:last-child span { border-bottom: 0; }.paper-footer { display: flex; align-items: end; justify-content: space-between; margin-top: 27px; color: #96a0a9; font-size: 8px; }.paper-barcode { display: flex; align-items: end; gap: 2px; height: 24px; }.paper-barcode i { display: block; height: 24px; background: #273643; }.paper-selection { position: absolute; inset: 18px; border: 1px solid rgb(227 95 55 / 55%); pointer-events: none; }.paper-selection::after { position: absolute; top: -4px; right: -4px; width: 7px; height: 7px; border: 1px solid var(--accent); background: #fff; content: ''; }
.property-line { display: flex; justify-content: space-between; align-items: center; gap: 5px; padding: 9px 0; border-bottom: 1px solid #dce3e8; color: #7b8996; font-size: 9px; }.property-line b { color: #4a5968; font-size: 9px; font-weight: 600; }.color-swatch { width: 12px; height: 12px; border-radius: 2px; background: #273643; }
.print-intro__capabilities { max-width: 1440px; margin: 0 auto; padding: 110px clamp(24px, 6vw, 88px) 120px; }.print-intro__section-heading { display: grid; grid-template-columns: 1fr 1fr; column-gap: 70px; align-items: end; margin-bottom: 58px; }.print-intro__section-heading > p { grid-column: 1 / -1; }.print-intro__section-heading h2 { margin: 0; font-size: clamp(36px, 4vw, 56px); line-height: 1.08; letter-spacing: -.5px; }.print-intro__section-heading > span { max-width: 430px; justify-self: end; color: var(--muted); font-size: 14px; line-height: 1.8; }.print-intro__capability-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); }.capability-card { position: relative; min-height: 245px; padding: 26px 24px 30px 0; border-right: 1px solid var(--line); }.capability-card:not(:first-child) { padding-left: 24px; }.capability-card:nth-child(3n) { border-right: 0; }.capability-card:nth-child(n + 4) { border-top: 1px solid var(--line); }.capability-card__index { display: block; margin-bottom: 29px; color: #9aa6b1; font-size: 11px; font-weight: 700; letter-spacing: 1px; }.capability-card > i { color: #32866f; font-size: 27px; }.capability-card h3 { margin: 22px 0 11px; font-size: 18px; }.capability-card p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.75; }.capability-card__line { display: block; width: 30px; height: 2px; margin-top: 24px; background: var(--accent); }
.print-intro__cta { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding: 66px max(24px, calc((100% - 1264px) / 2)); background: var(--ink); color: #fff; }.print-intro__cta p { margin-bottom: 12px; color: #8dd2b8; }.print-intro__cta h2 { margin: 0; font-size: clamp(28px, 3vw, 44px); }.print-intro__primary--light { flex: none; background: #fff; color: var(--ink); box-shadow: none; }.print-intro__primary--light:hover { box-shadow: 0 10px 20px rgb(0 0 0 / 18%); }
@media (max-width: 1050px) { .print-intro__hero-inner { padding-top: 65px; }.print-intro__preview { transform: none; }.print-intro__preview--real { height: 650px; }.print-intro__capability-grid { grid-template-columns: repeat(2, 1fr); }.capability-card:nth-child(3n) { border-right: 1px solid var(--line); }.capability-card:nth-child(2n) { border-right: 0; }.capability-card:nth-child(n + 3) { border-top: 1px solid var(--line); } }
@media (max-width: 640px) { .print-intro__hero-inner { min-height: auto; padding: 52px 20px 52px; gap: 38px; }.print-intro__lead { font-size: 14px; }.print-intro__meta { gap: 12px; margin-top: 34px; }.print-intro__preview--real { height: 520px; }.print-intro__capabilities { padding: 72px 20px 80px; }.print-intro__section-heading { display: block; margin-bottom: 38px; }.print-intro__section-heading > span { display: block; margin-top: 22px; }.print-intro__capability-grid { grid-template-columns: 1fr; }.capability-card, .capability-card:not(:first-child) { min-height: auto; padding: 24px 0; border-right: 0; border-top: 1px solid var(--line); }.capability-card:first-child { border-top: 0; }.print-intro__cta { display: block; padding: 48px 20px; }.print-intro__primary--light { margin-top: 28px; } }
</style>
