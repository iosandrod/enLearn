<template>
  <div class="print-intro">
    <section class="hero">
      <div class="page-width hero__grid">
        <div class="hero__copy">
          <p class="eyebrow"><span></span>研峰打印设计器 · 让业务数据落到纸上</p>
          <h1>设计一次，<br />让每一份数据<br /><em>都有自己的样子。</em></h1>
          <p class="hero__lead">从一张产品标签，到一整批业务单据。<br />自由设计模板，绑定业务数据，批量生成你需要的每一份。</p>
          <div class="actions">
            <RouterLink class="button button--primary" to="/print-designer">开始设计 <i class="ri-arrow-right-up-line" aria-hidden="true"></i></RouterLink>
            <a class="button button--outline" href="#scenarios">看看行业场景 <i class="ri-arrow-down-line" aria-hidden="true"></i></a>
          </div>
          <div class="hero__benefits"><span><i class="ri-check-line" aria-hidden="true"></i>可视化拖拽</span><span><i class="ri-check-line" aria-hidden="true"></i>数据源绑定</span><span><i class="ri-check-line" aria-hidden="true"></i>批量出图与打印</span></div>
        </div>
        <div class="hero__visual" aria-label="出库单与产品标签设计样张">
          <div class="hero__visual-top"><span><i class="ri-layout-masonry-line" aria-hidden="true"></i>从数据，到单据</span><span class="demo-label">设计样张</span></div>
          <div class="hero__document"><PrintLandingSample kind="warehouse" /></div>
          <div class="hero__tag"><PrintLandingSample kind="label" /></div>
          <div class="hero__binding"><i class="ri-database-2-line" aria-hidden="true"></i><div><strong>业务字段 → 打印内容</strong><span>单号 · 产品 · 数量 · 条码</span></div><i class="ri-link" aria-hidden="true"></i></div>
          <div class="hero__visual-bottom"><span class="status-dot"></span>同一套模板，每条数据独立生成<span>01 / ∞</span></div>
        </div>
      </div>
      <div class="hero__strip"><div class="page-width"><span>一套设计器，多种业务输出</span><div><span>业务单据</span><i></i><span>产品标签</span><i></i><span>个人名片</span><i></i><span>生产任务表</span><i></i><span>物流面单</span></div></div></div>
    </section>

    <section id="capabilities" class="section page-width">
      <div class="section-heading"><div><p class="eyebrow">01 / 核心能力</p><h2>模板负责设计，<br />数据负责变化。</h2></div><p>把重复排版交给模板，把业务内容交给数据源。<br />标签、表格、二维码与条形码，在同一个画布里完成。</p></div>
      <div class="feature-grid">
        <article v-for="(item, index) in capabilities" :key="item.title" class="feature" :class="{ 'feature--featured': index < 2 }">
          <div class="feature__top"><i :class="item.icon" aria-hidden="true"></i><span>0{{ index + 1 }}</span></div>
          <h3>{{ item.title }}</h3><p>{{ item.description }}</p>
          <div v-if="index === 0" class="batch-visual" aria-hidden="true"><span><i class="ri-file-list-3-line"></i>一份模板</span><i class="ri-arrow-right-line"></i><div><span v-for="n in 3" :key="n"><i class="ri-file-text-line"></i>0{{ n }}</span></div></div>
          <div v-else-if="index === 1" class="binding-visual" aria-hidden="true"><code v-text="'{{ product.name }}'"></code><i class="ri-arrow-right-line"></i><span>精密连接器</span></div>
          <div v-else class="feature__tags"><span v-for="tag in item.tags" :key="tag">{{ tag }}</span></div>
        </article>
      </div>
    </section>

    <section id="scenarios" class="scenarios section">
      <div class="page-width">
        <div class="section-heading"><div><p class="eyebrow">02 / 行业应用</p><h2>业务走到哪里，<br />打印就用在哪里。</h2></div><p>仓储、制造、零售、商务、物流……<br />让每个业务环节，都有清晰规范的纸面表达。</p></div>
        <div class="scenario-tabs" role="tablist" aria-label="行业使用场景">
          <button v-for="scene in scenarios" :id="`tab-${scene.id}`" :key="scene.id" type="button" role="tab" :aria-selected="activeScenario === scene.id" :aria-controls="`panel-${scene.id}`" :tabindex="activeScenario === scene.id ? 0 : -1" :class="{ 'is-active': activeScenario === scene.id }" @click="activeScenario = scene.id" @keydown="navigateScenarios($event, scene.id)"><i :class="scene.icon" aria-hidden="true"></i>{{ scene.label }}</button>
        </div>
        <div :id="`panel-${selectedScenario.id}`" class="scenario-panel" role="tabpanel" :aria-labelledby="`tab-${selectedScenario.id}`" tabindex="0">
          <div class="scenario-panel__copy"><span class="scenario-panel__category">{{ selectedScenario.category }}</span><h3>{{ selectedScenario.title }}</h3><p>{{ selectedScenario.description }}</p><ul><li v-for="point in selectedScenario.points" :key="point"><i class="ri-check-line" aria-hidden="true"></i>{{ point }}</li></ul><div class="scenario-panel__outputs"><span>适用输出</span><div><span v-for="output in selectedScenario.outputs" :key="output">{{ output }}</span></div></div><RouterLink class="text-link" to="/print-designer">设计我的{{ selectedScenario.label }}模板 <i class="ri-arrow-right-line" aria-hidden="true"></i></RouterLink></div>
          <div class="scenario-panel__preview"><div class="sample-caption"><span><i class="ri-file-paper-2-line" aria-hidden="true"></i>{{ selectedScenario.sampleTitle }}</span><span>示例数据 / 设计示意</span></div><div class="scenario-panel__paper" :class="`scenario-panel__paper--${selectedScenario.id}`"><PrintLandingSample :kind="selectedScenario.id" /></div><p>一张样稿，连接一个真实的业务场景。</p></div>
        </div>
      </div>
    </section>

    <section class="section page-width workflow">
      <div class="section-heading"><div><p class="eyebrow">03 / 从设计到输出</p><h2>三步，把数据变成成品。</h2></div><a class="text-link" href="#designer-preview">在线体验画布 <i class="ri-arrow-down-line" aria-hidden="true"></i></a></div>
      <ol class="workflow__steps"><li v-for="(step, index) in steps" :key="step.title"><span class="workflow__number">0{{ index + 1 }}</span><div><h3>{{ step.title }}</h3><p>{{ step.description }}</p></div><i v-if="index < 2" class="ri-arrow-right-line workflow__arrow" aria-hidden="true"></i></li></ol>
    </section>

    <section id="designer-preview" class="designer-section page-width">
      <div class="designer-section__heading"><div><p class="eyebrow">动手试一试</p><h2>你的下一份模板，从这里开始。</h2><p>拖入组件、调整版式，体验真实的打印设计画布。</p></div><RouterLink class="text-link" to="/print-designer">进入完整设计器 <i class="ri-arrow-right-up-line" aria-hidden="true"></i></RouterLink></div>
      <div class="designer-frame" :class="{ 'designer-frame--loaded': showDesigner }">
        <template v-if="showDesigner"><Suspense><TldrawVue :show-template-controls="false" /><template #fallback><div class="designer-placeholder" role="status">正在加载设计画布…</div></template></Suspense></template>
        <div v-else class="designer-placeholder"><div class="designer-placeholder__icon"><i class="ri-pencil-ruler-2-line" aria-hidden="true"></i></div><h3>把业务需要，拖进画布。</h3><p>文字、图片、表格、二维码、条形码，自由组合。</p><button class="button button--primary" type="button" @click="showDesigner = true">加载在线画布 <i class="ri-arrow-right-line" aria-hidden="true"></i></button><span>也可以直接进入完整设计器，开始创建模板</span></div>
      </div>
    </section>

    <section id="start-design" class="cta"><div class="page-width cta__inner"><div><p class="eyebrow">让模板成为业务的一部分</p><h2>下一批标签与单据，<br />从这一次设计开始。</h2><p>设计模板 · 绑定数据 · 批量输出</p></div><RouterLink class="button button--primary" to="/print-designer">打开打印设计器 <i class="ri-arrow-right-up-line" aria-hidden="true"></i></RouterLink></div></section>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import PrintLandingSample from '../components/PrintLandingSample.vue';

useSeoMeta({
  title: '打印设计器｜批量出图、数据绑定与业务单据设计',
  description: '研峰打印设计器支持批量出图、数据源绑定、高级表格、二维码与条形码，覆盖仓储、产品标签、名片、生产任务、收发货与物流场景。',
});

const TldrawVue = defineAsyncComponent(() => import('tldraw-vue-phase-one'));
const showDesigner = ref(false);
const activeScenario = ref('warehouse');
const capabilities = [
  { title: '批量出图，一次设计反复使用', icon: 'ri-stack-line', description: '同一份模板套用多条业务数据，批量生成内容各不相同的标签与单据，减少逐张编辑的重复工作。', tags: [] },
  { title: '数据源绑定，内容随数据生成', icon: 'ri-database-2-line', description: '将业务字段绑定到文字、图片、表格和条码。单号、产品、客户与明细数据，各自出现在该出现的位置。', tags: [] },
  { title: '高级表格，装得下业务细节', icon: 'ri-table-2', description: '自定义表格版式、合并单元格，结合数据明细组织复杂表单，让生产任务与收发货单据清晰易读。', tags: ['明细数据', '合并单元格', '自定义版式'] },
  { title: '二维码，把信息放进一次扫描', icon: 'ri-qr-code-line', description: '将产品编号、业务内容或链接生成二维码，用于产品信息、单据关联、名片展示与追溯信息标识。', tags: ['内容绑定', '链接编码', '信息标识'] },
  { title: '条形码，让业务编号可识别', icon: 'ri-barcode-line', description: '为商品、物料、订单与包裹生成条形码，将业务编号转为便于扫码录入的标识，适配日常管理流程。', tags: ['Code 128', 'Code 39', 'EAN / UPC'] },
  { title: '可视化排版，大小版式自由组合', icon: 'ri-pencil-ruler-2-line', description: '拖拽组合文字、图形、图片与业务组件，调整纸张尺寸与布局，复用模板设计标签、名片和业务单据。', tags: ['拖拽设计', '纸张设置', '模板复用'] },
];
const scenarios = [
  { id: 'warehouse', icon: 'ri-home-gear-line', label: '仓储出入库', category: 'WAREHOUSE / 仓储管理', title: '每一次出入库，都有据可查。', description: '把仓库、物料、批次和数量放进同一张单据，让出入库交接与库存核对有清晰的记录。', points: ['绑定出入库单号、仓库与经办人', '用表格展示物料、规格、数量等明细', '加入业务条码，方便扫码识别单据'], outputs: ['入库单', '出库单', '库存盘点表'], sampleTitle: '仓储出库单' },
  { id: 'label', icon: 'ri-price-tag-3-line', label: '产品标签', category: 'PRODUCT / 产品标识', title: '一件产品，一张专属标签。', description: '从零售商品到工业物料，将型号、规格、批次与产品编码变成标准化标签，帮助产品被识别、被管理。', points: ['绑定产品名称、规格与批次信息', '生成对应的产品二维码或条形码', '同一版式套用多条产品数据批量出图'], outputs: ['商品标签', '物料标签', '批次标识'], sampleTitle: '产品信息标签' },
  { id: 'card', icon: 'ri-contacts-line', label: '个人名片', category: 'BUSINESS / 商务交流', title: '让每一次见面，留下清晰印象。', description: '统一团队名片风格，将姓名、职位与联系方式绑定到模板，为不同成员生成各自的商务名片。', points: ['自由排版姓名、职位、品牌与联系方式', '加入二维码，展示个人介绍或业务链接', '复用同一模板，批量生成团队成员名片'], outputs: ['个人名片', '团队名片', '联系卡片'], sampleTitle: '个人商务名片' },
  { id: 'production', icon: 'ri-tools-line', label: '生产任务', category: 'MANUFACTURING / 生产制造', title: '把生产要求，交代到每一道工序。', description: '将生产任务、物料清单和工序要求整理成表格单据，为车间流转、任务分配与生产记录提供纸面依据。', points: ['绑定任务编号、产品与计划生产数量', '高级表格呈现工序与物料等任务明细', '预留执行记录、检验与签字位置'], outputs: ['生产任务表', '工序流转单', '物料清单'], sampleTitle: '生产任务单' },
  { id: 'delivery', icon: 'ri-inbox-archive-line', label: '出货收货', category: 'TRADE / 收发货协作', title: '发得明白，收得准确。', description: '把客户、供应商、订单与商品明细组织成规范单据，让发货交接、到货验收与签收核对更方便。', points: ['绑定往来单位、订单号和收发货信息', '表格列出品名、数量及交付备注', '保留发货、收货和签收记录区域'], outputs: ['送货单', '收货单', '签收回执'], sampleTitle: '送货交接单' },
  { id: 'logistics', icon: 'ri-truck-line', label: '物流快递', category: 'LOGISTICS / 物流配送', title: '让每一个包裹，都带着完整信息。', description: '集中排版寄件人、收件人、地址与运单标识，设计适合业务需要的物流标签和配送交接单。', points: ['绑定寄收件信息与包裹业务数据', '用条形码展示运单或包裹编号', '复用模板，批量生成物流标签与单据'], outputs: ['物流标签', '配送单', '包裹标识'], sampleTitle: '物流配送标签' },
];
const selectedScenario = computed(() => scenarios.find((scene) => scene.id === activeScenario.value) ?? scenarios[0]);
const steps = [
  { title: '设计模板', description: '选择纸张尺寸，拖入文字、图片、表格与条码，排出需要的版式。' },
  { title: '绑定数据', description: '把业务字段与模板组件关联起来，让每条数据都有对应的内容。' },
  { title: '批量输出', description: '使用业务数据生成标签与单据，预览结果，再出图或打印。' },
];
function navigateScenarios(event: KeyboardEvent, id: string) {
  const index = scenarios.findIndex((scene) => scene.id === id);
  let next: number;
  if (event.key === 'ArrowRight') next = (index + 1) % scenarios.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + scenarios.length) % scenarios.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = scenarios.length - 1;
  else return;
  event.preventDefault();
  activeScenario.value = scenarios[next].id;
  document.getElementById(`tab-${activeScenario.value}`)?.focus();
}
</script>

<style scoped>
.print-intro { --ink: #172a30; --muted: #64716e; --line: #dedfd7; --accent: #dc5a35; --cream: #f7f7f0; margin-top: 68px; background: #fff; color: var(--ink); }
.print-intro *, .print-intro *::before, .print-intro *::after { box-sizing: border-box; }
.print-intro :is(#capabilities, #scenarios, #designer-preview, #start-design) { scroll-margin-top: 88px; }
.print-intro a { text-decoration: none; }
.print-intro :is(a, button):focus-visible { outline: 3px solid #dc5a35; outline-offset: 5px; }
.page-width { width: min(1240px, calc(100% - 80px)); margin-inline: auto; }
.eyebrow { display: flex; align-items: center; gap: 9px; margin: 0 0 22px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 1.6px; }
.eyebrow > span { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.hero { background: var(--cream); }
.hero__grid { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 64px; padding-block: 84px 76px; }
h1 { margin: 0; font-size: clamp(40px, 4.3vw, 64px); font-weight: 750; letter-spacing: -2px; line-height: 1.25; }
h1 em { color: var(--accent); font-style: normal; }
.hero__lead { margin: 27px 0 0; color: var(--muted); font-size: 16px; line-height: 1.9; }
.actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 32px; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 16px; min-height: 50px; padding: 0 23px; border: 1px solid transparent; border-radius: 6px; font-size: 14px; font-weight: 650; cursor: pointer; transition: background .2s, transform .2s; }
.button i { font-size: 20px; }
.button--primary { background: var(--accent); color: #fff; }
.button--primary:hover { background: #c24827; transform: translateY(-2px); }
.button--outline { border-color: #cbd0c7; color: var(--ink); background: transparent; }
.button--outline:hover { background: #e9ece2; }
.hero__benefits { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 27px; color: var(--muted); font-size: 12px; }
.hero__benefits span { display: inline-flex; gap: 5px; align-items: center; }
.hero__benefits i { color: #397c66; font-size: 16px; }
.hero__visual { position: relative; min-height: 488px; padding: 22px; border: 1px solid #d8dccf; border-radius: 12px; background-color: #e9ede2; background-image: radial-gradient(#c4cebe 1px, transparent 1px); background-size: 16px 16px; }
.hero__visual-top, .hero__visual-bottom { display: flex; align-items: center; gap: 7px; color: #627160; font-size: 11px; }
.hero__visual-top { justify-content: space-between; }
.hero__visual-top > span:first-child { display: flex; align-items: center; gap: 7px; font-weight: 650; }
.demo-label { padding: 4px 8px; border: 1px solid #bdc8b9; border-radius: 3px; background: #edf0e7; font-size: 10px; }
.hero__document { width: 78%; margin: 25px 0 44px 6px; transform: rotate(-4deg); box-shadow: 0 15px 25px #27382b20; }
.hero__tag { position: absolute; width: 46%; right: -18px; bottom: 85px; transform: rotate(6deg); box-shadow: 0 12px 30px #27382b22; }
.hero__binding { position: absolute; top: 104px; right: -22px; display: flex; align-items: center; gap: 12px; padding: 15px 17px; border: 1px solid #e4e6dc; border-radius: 6px; background: #fff; box-shadow: 0 10px 25px #27382b0c; }
.hero__binding > i:first-child { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 5px; background: #eaf1e6; color: #43775e; font-size: 20px; }
.hero__binding strong, .hero__binding span { display: block; }
.hero__binding strong { font-size: 12px; }
.hero__binding span { margin-top: 5px; color: var(--muted); font-size: 10px; }
.hero__binding > i:last-child { color: #548566; }
.hero__visual-bottom { position: absolute; right: 22px; bottom: 20px; left: 22px; }
.hero__visual-bottom > span:last-child { margin-left: auto; font-family: monospace; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #548566; }
.hero__strip { border-block: 1px solid var(--line); }
.hero__strip > div { display: flex; justify-content: space-between; align-items: center; gap: 28px; min-height: 77px; color: var(--muted); font-size: 12px; }
.hero__strip > div > span { flex-shrink: 0; }
.hero__strip > div > div { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; color: var(--ink); font-size: 14px; font-weight: 650; }
.hero__strip i { width: 3px; height: 3px; border-radius: 50%; background: #a3aca0; }
.section { padding-block: 90px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; margin-bottom: 40px; }
h2 { margin: 0; font-size: clamp(28px, 3vw, 40px); line-height: 1.4; letter-spacing: -1px; font-weight: 700; }
.section-heading > p { margin: 0 0 4px; color: var(--muted); font-size: 14px; line-height: 1.9; }
.feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.feature { padding: 28px; border: 1px solid #e3e7df; border-radius: 8px; background: #fff; }
.feature--featured { background: #f6f8f1; }
.feature__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.feature__top > i { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid #d9e2d3; border-radius: 7px; color: #477158; background: #edf3e8; font-size: 23px; }
.feature__top > span { color: #8c998b; font-size: 11px; font-family: monospace; }
.feature h3 { margin: 0 0 12px; font-size: 18px; line-height: 1.5; }
.feature p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.85; }
.feature__tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 24px; }
.feature__tags span { padding: 5px 8px; border-radius: 3px; background: #f5f6f2; color: #64705e; font-size: 10px; }
.batch-visual, .binding-visual { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; margin-top: 24px; font-size: 11px; }
.batch-visual > span, .batch-visual > div > span { display: inline-flex; align-items: center; gap: 5px; padding: 10px 8px; background: #fff; border: 1px solid #dae1d4; border-radius: 4px; }
.batch-visual > div { display: flex; gap: 4px; }
.batch-visual i { color: #658359; font-size: 16px; }
.binding-visual code { padding: 10px 8px; border: 1px dashed #adba9f; border-radius: 4px; color: #567047; background: #fff; font-size: 11px; }
.binding-visual > span { padding: 9px 8px; border-radius: 4px; color: #a94a28; background: #fae8dc; white-space: nowrap; }
.scenarios { border-block: 1px solid #e9e9e1; background: var(--cream); }
.scenario-tabs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 24px; }
.scenario-tabs button { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 52px; border: 1px solid #ddded4; border-radius: 5px; background: #fff; color: #586359; font-size: 13px; font-weight: 650; cursor: pointer; transition: background .2s, color .2s; }
.scenario-tabs button i { font-size: 19px; }
.scenario-tabs button:hover { background: #e9ede0; }
.scenario-tabs button.is-active { border-color: var(--ink); color: #fff; background: var(--ink); }
.scenario-panel { display: grid; grid-template-columns: 1fr 1fr; min-height: 485px; overflow: hidden; border: 1px solid #dedfd5; border-radius: 9px; background: #fff; }
.scenario-panel__copy { padding: 44px; }
.scenario-panel__category { color: #53745e; font-size: 10px; font-weight: 650; letter-spacing: 1.8px; }
.scenario-panel h3 { margin: 19px 0 15px; font-size: 26px; line-height: 1.45; letter-spacing: -.6px; }
.scenario-panel__copy > p { margin: 0; max-width: 400px; color: var(--muted); font-size: 14px; line-height: 1.85; }
.scenario-panel ul { display: grid; gap: 13px; padding: 0; margin: 25px 0; list-style: none; }
.scenario-panel li { display: flex; gap: 8px; color: #485b4b; font-size: 13px; line-height: 1.6; }
.scenario-panel li i { color: #578666; font-size: 16px; }
.scenario-panel__outputs { padding-top: 19px; margin-bottom: 25px; border-top: 1px solid #e8eae2; }
.scenario-panel__outputs > span { color: #849080; font-size: 10px; }
.scenario-panel__outputs > div { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
.scenario-panel__outputs > div > span { padding: 5px 10px; border-radius: 3px; background: #f2f4ed; color: #5b7053; font-size: 11px; }
.text-link { display: inline-flex; align-items: center; gap: 12px; color: var(--accent); font-size: 13px; font-weight: 650; line-height: 1.6; }
.text-link:hover { color: #a84123; }
.scenario-panel__preview { display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 24px; padding: 26px 32px 23px; border-left: 1px solid #e3e5da; background-color: #ecefe5; background-image: radial-gradient(#c6cfbe 1px, transparent 1px); background-size: 18px 18px; }
.sample-caption { display: flex; justify-content: space-between; width: 100%; gap: 10px; color: #687561; font-size: 10px; }
.sample-caption > span:first-child { display: inline-flex; align-items: center; gap: 5px; }
.sample-caption > span:last-child { font-size: 9px; }
.scenario-panel__paper { width: 100%; max-width: 410px; box-shadow: 0 12px 24px #27382b16; }
.scenario-panel__paper--card { max-width: 390px; }
.scenario-panel__paper--label { max-width: 310px; }
.scenario-panel__paper--logistics { max-width: 290px; }
.scenario-panel__preview > p { margin: 0; color: #718069; font-size: 10px; }
.workflow__steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; margin: 0; padding: 28px 0 0; border-top: 1px solid var(--line); list-style: none; }
.workflow__steps li { position: relative; display: flex; align-items: flex-start; gap: 18px; padding-right: 18px; }
.workflow__number { flex-shrink: 0; color: var(--accent); font-family: monospace; font-size: 26px; line-height: 1.3; }
.workflow__steps h3 { margin: 0 0 11px; font-size: 18px; }
.workflow__steps p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.85; }
.workflow__arrow { position: absolute; right: -19px; top: 7px; color: #a5b19b; font-size: 20px; }
.designer-section { padding-bottom: 90px; }
.designer-section__heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.designer-section__heading .eyebrow { margin-bottom: 14px; }
.designer-section__heading h2 { font-size: 28px; }
.designer-section__heading p:last-child { margin: 13px 0 0; color: var(--muted); font-size: 13px; }
.designer-frame { min-height: 330px; overflow: hidden; border: 1px solid #d8dfd3; border-radius: 8px; background: #f1f4ee; }
.designer-frame--loaded { height: 720px; }
.designer-frame :deep(.app-shell), .designer-frame :deep(.editor-host) { height: 100%; min-height: 0; }
.designer-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 330px; gap: 16px; padding: 35px 20px; text-align: center; }
.designer-placeholder__icon { display: grid; place-items: center; width: 50px; height: 50px; border: 1px solid #ccd7c3; border-radius: 10px; color: #688357; font-size: 27px; }
.designer-placeholder h3 { margin: 0; font-size: 22px; }
.designer-placeholder p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
.designer-placeholder > span { color: #7c8976; font-size: 10px; line-height: 1.6; }
.cta { padding-block: 62px; background: var(--ink); color: #fff; }
.cta__inner { display: flex; justify-content: space-between; align-items: center; gap: 30px; }
.cta .eyebrow { color: #b8cfae; }
.cta h2 { font-size: clamp(28px, 3vw, 40px); }
.cta p:last-child { margin: 20px 0 0; color: #a5b7ac; font-size: 13px; letter-spacing: 2px; }
@media (max-width: 1100px) {
  .hero__grid { gap: 35px; } .hero__visual { min-height: 450px; }
  .hero__document { width: 90%; margin-left: 0; } .hero__tag { width: 50%; right: -12px; } .hero__binding { right: -12px; }
  .hero__strip > div > div { gap: 18px; font-size: 12px; }
  .feature { padding: 22px; } .feature-grid { grid-template-columns: repeat(2, 1fr); }
  .scenario-panel__copy { padding: 32px; } .scenario-panel h3 { font-size: 23px; }
  .scenario-tabs button { gap: 5px; font-size: 12px; }
}
@media (max-width: 800px) {
  .page-width { width: calc(100% - 40px); } .hero__grid { grid-template-columns: 1fr; padding-block: 50px; gap: 40px; }
  h1 { font-size: clamp(38px, 7vw, 54px); } .hero__copy { max-width: 580px; }
  .hero__visual { width: min(540px, calc(100% - 12px)); min-height: 465px; justify-self: center; }
  .hero__document { width: 78%; } .hero__tag { width: 44%; }
  .hero__strip > div { flex-direction: column; align-items: flex-start; gap: 16px; padding-block: 20px; }
  .section { padding-block: 60px; } .section-heading { align-items: flex-start; flex-direction: column; gap: 20px; margin-bottom: 30px; }
  .section-heading .eyebrow { margin-bottom: 15px; } .scenario-tabs { grid-template-columns: repeat(3, 1fr); }
  .scenario-panel { grid-template-columns: 1fr; } .scenario-panel__preview { min-height: 430px; border-left: 0; border-top: 1px solid #e3e5da; }
  .workflow__steps { gap: 22px; } .workflow__steps li { flex-direction: column; gap: 12px; padding-right: 0; } .workflow__arrow { right: -17px; }
  .designer-section { padding-bottom: 60px; } .designer-section__heading { align-items: flex-start; flex-direction: column; }
  .designer-frame--loaded { height: 580px; }
}
@media (max-width: 480px) {
  .eyebrow { font-size: 10px; letter-spacing: .8px; } .hero__lead { font-size: 14px; } .actions { gap: 10px; }
  .button { padding-inline: 16px; gap: 9px; font-size: 13px; } .hero__benefits { gap: 12px; font-size: 10px; }
  .hero__visual { padding: 16px; min-height: 390px; } .hero__document { width: 93%; margin-top: 24px; }
  .hero__tag { width: 54%; bottom: 60px; right: -8px; } .hero__binding { top: 86px; padding: 11px; gap: 8px; right: -8px; }
  .hero__binding strong { font-size: 10px; } .hero__binding span { font-size: 8px; } .hero__binding > i:first-child { width: 28px; height: 28px; }
  .hero__visual-bottom { left: 16px; right: 16px; font-size: 9px; }
  .hero__strip > div > div { gap: 12px; font-size: 11px; } .hero__strip i { display: none; }
  .feature-grid { grid-template-columns: 1fr; } .feature h3 { font-size: 18px; }
  .scenario-panel__copy { padding: 28px 23px; } .scenario-panel__copy h3 { font-size: 22px; }
  .scenario-panel__preview { padding: 22px 18px; min-height: 370px; } .sample-caption { font-size: 9px; } .sample-caption > span:last-child { font-size: 8px; }
  .workflow__steps { grid-template-columns: 1fr; gap: 25px; } .workflow__steps li { flex-direction: row; gap: 18px; } .workflow__arrow { display: none; }
  .designer-section__heading h2 { font-size: 23px; } .cta { padding-block: 45px; } .cta__inner { flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .button, .scenario-tabs button { transition: none; } }
</style>
