import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { useGlobalProperties } from '../../hooks/useGlobalProperties';
import { createEditorColorProp, createEditorInputProp, createEditorSelectProp, } from '../../visual-editor/visual-editor.props';
const categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const seriesData = [120, 200, 150, 80, 70, 110, 130];
const pieData = [
    { name: 'Direct', value: 335 },
    { name: 'Email', value: 310 },
    { name: 'Ads', value: 234 },
    { name: 'Search', value: 135 },
    { name: 'Video', value: 154 },
];
const radarIndicators = [
    { name: 'Sales', max: 100 },
    { name: 'Admin', max: 100 },
    { name: 'Tech', max: 100 },
    { name: 'Support', max: 100 },
    { name: 'Marketing', max: 100 },
];
const radarData = [85, 72, 90, 64, 78];
const presets = [
    { key: 'echarts-bar', label: '柱状图', kind: 'bar', color: '#3b82f6' },
    { key: 'echarts-line', label: '折线图', kind: 'line', color: '#14b8a6' },
    { key: 'echarts-area', label: '面积图', kind: 'area', color: '#22c55e' },
    { key: 'echarts-pie', label: '饼图', kind: 'pie', color: '#f97316' },
    { key: 'echarts-doughnut', label: '环形图', kind: 'doughnut', color: '#8b5cf6' },
    { key: 'echarts-scatter', label: '散点图', kind: 'scatter', color: '#ec4899' },
    { key: 'echarts-radar', label: '雷达图', kind: 'radar', color: '#0ea5e9' },
];
const kindOptions = presets.map((item) => ({ label: item.label, value: item.kind }));
function parseJson(value, fallback) {
    if (Array.isArray(value) || (value && typeof value === 'object')) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function buildChartOption(props, fallbackKind) {
    const optionOverride = parseJson(props.optionJson, null);
    if (optionOverride && typeof optionOverride === 'object' && !Array.isArray(optionOverride)) {
        return optionOverride;
    }
    const kind = (props.chartType || fallbackKind);
    const title = String(props.title || '图表');
    const color = String(props.color || '#3b82f6');
    const xAxisData = parseJson(props.categoriesJson, categories);
    const values = parseJson(props.seriesDataJson, seriesData);
    if (kind === 'pie' || kind === 'doughnut') {
        return {
            color: [color, '#14b8a6', '#f97316', '#8b5cf6', '#64748b'],
            title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 14 } },
            tooltip: { trigger: 'item' },
            legend: { bottom: 0, type: 'scroll' },
            series: [
                {
                    name: title,
                    type: 'pie',
                    radius: kind === 'doughnut' ? ['42%', '68%'] : '62%',
                    center: ['50%', '50%'],
                    data: parseJson(props.pieDataJson, pieData),
                },
            ],
        };
    }
    if (kind === 'radar') {
        return {
            color: [color],
            title: { text: title, left: 12, top: 8, textStyle: { fontSize: 14 } },
            tooltip: {},
            radar: { indicator: parseJson(props.radarIndicatorsJson, radarIndicators), radius: '62%' },
            series: [
                {
                    name: title,
                    type: 'radar',
                    data: [{ value: parseJson(props.radarDataJson, radarData), name: title }],
                },
            ],
        };
    }
    if (kind === 'scatter') {
        return {
            color: [color],
            title: { text: title, left: 12, top: 8, textStyle: { fontSize: 14 } },
            tooltip: { trigger: 'item' },
            grid: { left: 42, right: 20, top: 48, bottom: 32 },
            xAxis: {},
            yAxis: {},
            series: [
                {
                    name: title,
                    type: 'scatter',
                    symbolSize: 12,
                    data: values.map((value, index) => [index + 1, value]),
                },
            ],
        };
    }
    return {
        color: [color],
        title: { text: title, left: 12, top: 8, textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        grid: { left: 42, right: 20, top: 52, bottom: 32 },
        xAxis: { type: 'category', data: xAxisData },
        yAxis: { type: 'value' },
        series: [
            {
                name: title,
                type: kind === 'bar' ? 'bar' : 'line',
                smooth: kind !== 'bar',
                areaStyle: kind === 'area' ? {} : undefined,
                data: values,
            },
        ],
    };
}
const EchartsView = defineComponent({
    name: 'LowCodeEchartsView',
    props: {
        option: {
            type: Object,
            required: true,
        },
    },
    setup(props) {
        const elRef = ref();
        let chart = null;
        let resizeObserver = null;
        const renderChart = async () => {
            await nextTick();
            if (!elRef.value)
                return;
            chart ||= echarts.init(elRef.value);
            chart.setOption(props.option, true);
            chart.resize();
        };
        onMounted(() => {
            void renderChart();
            if (typeof ResizeObserver !== 'undefined' && elRef.value) {
                resizeObserver = new ResizeObserver(() => chart?.resize());
                resizeObserver.observe(elRef.value);
            }
        });
        watch(() => props.option, () => void renderChart(), { deep: true });
        onBeforeUnmount(() => {
            resizeObserver?.disconnect();
            chart?.dispose();
            chart = null;
        });
        return () => <div ref={elRef} style={{ width: '100%', height: '100%', minHeight: '220px' }}/>;
    },
});
function createPreview(preset) {
    const linePath = preset.kind === 'line' || preset.kind === 'area';
    return (<div style={{
            width: '220px',
            height: '92px',
            display: 'flex',
            alignItems: 'end',
            gap: '8px',
            padding: '12px 10px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            background: '#fff',
        }}>
      {linePath ? (<svg viewBox="0 0 180 64" width="180" height="64" aria-hidden="true">
          <polyline points="6,48 36,30 66,38 96,16 126,24 160,10" fill="none" stroke={preset.color} stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          {preset.kind === 'area' ? (<polygon points="6,48 36,30 66,38 96,16 126,24 160,10 160,62 6,62" fill={preset.color} opacity="0.18"/>) : null}
        </svg>) : preset.kind === 'pie' || preset.kind === 'doughnut' ? (<div style={{
                width: '66px',
                height: '66px',
                margin: '0 auto',
                borderRadius: '50%',
                background: `conic-gradient(${preset.color} 0 38%, #14b8a6 38% 62%, #f97316 62% 80%, #cbd5e1 80% 100%)`,
                boxShadow: preset.kind === 'doughnut' ? 'inset 0 0 0 18px #fff' : 'none',
            }}/>) : preset.kind === 'radar' ? (<svg viewBox="0 0 80 70" width="120" height="70" aria-hidden="true">
          <polygon points="40,4 74,26 62,64 18,64 6,26" fill="none" stroke="#cbd5e1"/>
          <polygon points="40,14 62,30 54,54 24,56 16,28" fill={preset.color} opacity="0.24" stroke={preset.color} stroke-width="3"/>
        </svg>) : ([42, 64, 48, 78, 36, 56].map((height) => (<span style={{
                width: '20px',
                height: `${height}px`,
                borderRadius: '4px 4px 0 0',
                background: preset.color,
                opacity: 0.82,
            }}/>)))}
    </div>);
}
function createChartComponent(preset) {
    return {
        key: preset.key,
        moduleName: 'chartComponents',
        label: preset.label,
        preview: () => createPreview(preset),
        render: ({ props, block, styles }) => {
            const { registerRef } = useGlobalProperties();
            return () => (<div ref={(el) => registerRef(el, block._vid)} style={{
                    ...styles,
                    width: '100%',
                    height: styles.height || '320px',
                    minHeight: styles.minHeight || '260px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    overflow: 'hidden',
                }}>
          <EchartsView option={buildChartOption(props, preset.kind)}/>
        </div>);
        },
        showStyleConfig: true,
        styles: {
            width: '420px',
            height: '320px',
            minHeight: '260px',
        },
        props: {
            title: createEditorInputProp({ label: '标题', defaultValue: preset.label }),
            chartType: createEditorSelectProp({
                label: '图表类型',
                defaultValue: preset.kind,
                options: kindOptions,
            }),
            color: createEditorColorProp({ label: '主色', defaultValue: preset.color }),
            categoriesJson: createEditorInputProp({
                label: '类目 JSON',
                defaultValue: JSON.stringify(categories),
            }),
            seriesDataJson: createEditorInputProp({
                label: '数值 JSON',
                defaultValue: JSON.stringify(seriesData),
            }),
            pieDataJson: createEditorInputProp({
                label: '饼图数据 JSON',
                defaultValue: JSON.stringify(pieData),
            }),
            radarIndicatorsJson: createEditorInputProp({
                label: '雷达指标 JSON',
                defaultValue: JSON.stringify(radarIndicators),
            }),
            radarDataJson: createEditorInputProp({
                label: '雷达数值 JSON',
                defaultValue: JSON.stringify(radarData),
            }),
            optionJson: createEditorInputProp({
                label: '完整 option JSON',
                defaultValue: '',
                tips: '填写后会覆盖上方配置',
            }),
        },
    };
}
export default presets.reduce((components, preset) => {
    components[preset.key] = createChartComponent(preset);
    return components;
}, {});
