<template>
  <div class="sample" :class="`sample--${kind}`">
    <template v-if="kind === 'card'">
      <div class="card-brand"><span class="brand-mark">YF</span><span>研峰智造<small>YANFENG INDUSTRIES</small></span></div>
      <div class="card-person"><div><h4>林晓</h4><p>产品经理 / PRODUCT MANAGER</p></div><svg class="qr" :viewBox="qrViewBox" role="img" aria-label="示例名片二维码"><path :d="qrPath" /></svg></div>
      <div class="card-contact"><span>138 0000 0000</span><span>linxiao@example.com</span><span>上海市 · 创新产业园</span></div>
    </template>
    <template v-else-if="kind === 'label'">
      <div class="label-top"><span>YF / PRODUCT</span><span>产品标签</span></div><h4>精密连接器</h4><p class="label-model">PRECISION CONNECTOR · YF-C200</p>
      <div class="label-info"><div><p>规格 <b>24 PIN / 黑色</b></p><p>批次 <b>B20261009</b></p><p>数量 <b>100 PCS</b></p></div><svg class="qr" :viewBox="qrViewBox" role="img" aria-label="示例产品二维码"><path :d="qrPath" /></svg></div><img class="barcode" :src="barcode" alt="示例产品编号条形码 YF-C200-001" />
    </template>
    <template v-else-if="kind === 'logistics'">
      <div class="logistics-top"><strong>物流配送</strong><span>STANDARD / 标准件</span></div><div class="route-code">沪 · 浦东 · 01</div>
      <div class="address"><span>收</span><div><strong>陈先生　138 **** 8000</strong><p>上海市浦东新区创新路 88 号<br />产业园 2 栋 101 室</p></div></div><div class="address address--sender"><span>寄</span><div><strong>研峰仓储中心</strong><p>上海市嘉定区智造路 18 号</p></div></div><img class="barcode" :src="barcode" alt="示例物流包裹编号条形码 YF-C200-001" /><div class="logistics-meta"><span>包裹：1 / 1</span><span>重量：2.5 kg</span><span>签收：________</span></div>
    </template>
    <template v-else>
      <div class="document-brand"><strong>YF / 研峰智造</strong><span>{{ kind === 'production' ? '生产管理' : kind === 'delivery' ? '收发货管理' : '仓储管理' }}</span></div>
      <div class="document-title"><h4>{{ document.title }}</h4><span>{{ document.subtitle }}</span></div>
      <div class="document-fields"><p v-for="field in document.fields" :key="field[0]"><span>{{ field[0] }}</span><b>{{ field[1] }}</b></p></div>
      <table><thead><tr><th v-for="heading in document.headings" :key="heading">{{ heading }}</th></tr></thead><tbody><tr v-for="(row, index) in document.rows" :key="index"><td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td></tr></tbody></table>
      <div class="document-total"><span>{{ document.note }}</span><strong>{{ document.total }}</strong></div><div class="document-bottom"><img class="barcode" :src="barcode" alt="示例业务编号条形码 YF-C200-001" /><div><span>{{ kind === 'production' ? '执行人' : '经办人' }}：________</span><span>{{ kind === 'delivery' ? '收货签字' : '审核人' }}：________</span></div></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import QRCode from 'qrcode';

const props = defineProps<{ kind: string }>();
// Illustrative records, not saved business templates. Codes use real encoders.
const qr = QRCode.create('YF-C200-001', { errorCorrectionLevel: 'M' });
const qrViewBox = `0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}`;
const qrPath = Array.from(qr.modules.data).map((cell, index) => cell ? `M${index % qr.modules.size + 4},${Math.floor(index / qr.modules.size) + 4}h1v1h-1z` : '').join('');
const barcode = '/site/print-sample-barcode.svg';
const documents = {
  warehouse: { title: '仓储出库单', subtitle: 'WAREHOUSE OUTBOUND', fields: [['出库单号', 'CK20261009001'], ['出库日期', '2026-10-09'], ['出库仓库', '成品一号仓'], ['经办人员', '林晓']], headings: ['序号', '物料 / 规格', '数量', '单位'], rows: [['01', '精密连接器 / 24 PIN', '100', '件'], ['02', '安装支架 / M8', '200', '件'], ['03', '防护外壳 / 黑色', '100', '件']], note: '备注：请核对物料及数量后出库', total: '合计 400 件' },
  production: { title: '生产任务单', subtitle: 'PRODUCTION WORK ORDER', fields: [['任务编号', 'SC20261009001'], ['计划日期', '2026-10-09'], ['生产产品', '精密连接器'], ['计划数量', '500 件']], headings: ['工序', '任务内容', '数量', '记录'], rows: [['01', '备料 / 配件核对', '500', '____'], ['02', '组装 / 连接器装配', '500', '____'], ['03', '检验 / 成品检测', '500', '____']], note: '要求：按工序完成并填写执行记录', total: '计划 500 件' },
  delivery: { title: '送货交接单', subtitle: 'DELIVERY NOTE', fields: [['送货单号', 'SH20261009001'], ['交付日期', '2026-10-09'], ['收货单位', '华东设备有限公司'], ['关联订单', 'SO20261008012']], headings: ['序号', '商品 / 规格', '数量', '单位'], rows: [['01', '精密连接器 / 24 PIN', '100', '件'], ['02', '安装支架 / M8', '200', '件'], ['03', '防护外壳 / 黑色', '100', '件']], note: '备注：请核对商品，签字确认收货', total: '交付 400 件' },
};
const document = computed(() => documents[props.kind as keyof typeof documents] ?? documents.warehouse);
</script>

<style scoped>
.sample { box-sizing: border-box; padding: 25px; background: #fff; color: #172a30; font-family: Arial, 'Microsoft YaHei', sans-serif; }
.sample * { box-sizing: border-box; } .sample h4, .sample p { margin: 0; }
.document-brand { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 2px solid #243d33; font-size: 9px; }
.document-brand strong { letter-spacing: .6px; } .document-brand > span { color: #859083; font-size: 8px; }
.document-title { padding-block: 16px; text-align: center; } .document-title h4 { font-size: 23px; letter-spacing: 4px; line-height: 1.4; }
.document-title > span { display: block; margin-top: 5px; color: #839080; font-size: 7px; letter-spacing: 1.7px; }
.document-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 17px; }
.document-fields p { display: flex; flex-wrap: wrap; gap: 5px; font-size: 8px; line-height: 1.5; } .document-fields span { color: #82907e; } .document-fields b { font-weight: 500; }
table { width: 100%; border-collapse: collapse; font-size: 8px; text-align: left; }
th, td { padding: 10px 7px; border: 1px solid #dce2d5; white-space: nowrap; } th { background: #edf1e6; color: #54704c; font-weight: 600; } td:first-child { color: #85917e; }
.document-total { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding-block: 12px; font-size: 7px; }
.document-total > span { color: #7c8876; } .document-total strong { font-weight: 600; font-size: 9px; }
.document-bottom { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 13px; border-top: 1px solid #e1e5dc; }
.barcode { display: block; width: 100%; height: 43px; object-fit: fill; } .document-bottom .barcode { width: 110px; height: 31px; }
.document-bottom > div { display: grid; gap: 11px; font-size: 7px; }
.sample--label { padding: 20px; } .label-top { display: flex; align-items: center; justify-content: space-between; gap: 5px; border-bottom: 1px solid #dce2d5; padding-bottom: 10px; color: #59764c; font-size: 7px; font-weight: 650; }
.sample--label h4 { margin: 16px 0 5px; font-size: 21px; } .label-model { font-size: 6px; letter-spacing: .4px; color: #82917a; }
.label-info { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-block: 14px; }
.label-info p { font-size: 8px; color: #819079; line-height: 2; } .label-info b { margin-left: 5px; font-weight: 500; color: #172a30; }
.qr { display: block; flex-shrink: 0; width: 64px; height: 64px; background: #fff; fill: #172a30; shape-rendering: crispEdges; }
.sample--card { padding: 30px; border-top: 5px solid #59794c; } .card-brand { display: flex; align-items: center; gap: 9px; font-size: 11px; font-weight: 600; }
.brand-mark { display: grid; place-items: center; width: 31px; height: 31px; border: 1px solid #58764b; color: #58764b; font-family: serif; font-size: 15px; }
.card-brand small { display: block; margin-top: 4px; color: #839179; font-size: 6px; letter-spacing: .8px; font-weight: 400; }
.card-person { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-block: 28px 25px; }
.card-person h4 { font-size: 30px; letter-spacing: 6px; } .card-person p { margin-top: 8px; color: #839179; font-size: 7px; }
.card-contact { display: flex; flex-wrap: wrap; gap: 8px 15px; padding-top: 15px; border-top: 1px solid #e0e5d9; font-size: 8px; color: #687960; }
.sample--logistics { padding: 21px; } .logistics-top { display: flex; justify-content: space-between; align-items: center; font-size: 12px; } .logistics-top > span { font-size: 6px; color: #7b8973; }
.route-code { padding-block: 13px; margin-top: 12px; border-block: 2px solid #172a30; font-size: 27px; font-weight: 750; text-align: center; }
.address { display: flex; align-items: flex-start; gap: 10px; padding-block: 15px; border-bottom: 1px solid #d9dfd1; }
.address > span { display: grid; place-items: center; flex-shrink: 0; width: 22px; height: 22px; background: #172a30; color: #fff; font-size: 11px; }
.address strong { display: block; margin: 3px 0 7px; font-size: 10px; } .address p { font-size: 9px; line-height: 1.7; }
.address--sender > span { background: #edf1e6; color: #617654; } .address--sender strong { font-size: 9px; } .address--sender p { font-size: 8px; }
.sample--logistics .barcode { margin-block: 18px 12px; } .logistics-meta { display: flex; justify-content: space-between; font-size: 7px; color: #75876b; }
@media (max-width: 480px) { .sample { padding: 18px; } th, td { padding: 9px 5px; font-size: 7px; } .document-fields { gap: 8px; } .document-title h4 { font-size: 21px; } .document-bottom .barcode { width: 95px; } .sample--label { padding: 15px; } .sample--label h4 { font-size: 18px; } .label-info { gap: 3px; } .label-info .qr { width: 48px; height: 48px; } .label-info p { font-size: 7px; } .card-contact { font-size: 7px; } }
</style>
