import { renderSlot, useSlots, ref, watchEffect } from 'vue';
import { VxeTabs, VxeTabPane } from 'vxe-pc-ui';
import styleModule from './index.module.scss';
import type { VisualEditorBlockData, VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

const VxeTabsComponent = VxeTabs as any;
const VxeTabPaneComponent = VxeTabPane as any;
type TabPaneConfig = { title: string; name: string; icon?: string; titleWidth?: string; preload?: boolean | string; slotKey: string };
type SlotConfig = { key: string; label: string; children: VisualEditorBlockData[] };
type TabPaneInput = Omit<TabPaneConfig, 'slotKey'>;

const defaultPanes = [
  { title: '基础信息', name: 'basic' },
  { title: '详细信息', name: 'detail' },
  { title: '操作记录', name: 'logs' },
] satisfies TabPaneInput[];
const tabsSlotCache: Record<string, Record<string, SlotConfig>> = {};

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  return false;
}
function toSlotKey(value: string, index: number) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return `tab_${normalized || index + 1}`;
}
function normalizePanes(value: unknown): TabPaneConfig[] {
  const rows = Array.isArray(value) && value.length ? value : defaultPanes;
  const usedKeys = new Set<string>();
  return rows.map((row, index) => {
    const source = typeof row === 'object' && row !== null ? row as Record<string, unknown> : {};
    const title = readString(source.title, `页签 ${index + 1}`);
    const name = readString(source.name, `tab${index + 1}`);
    let slotKey = toSlotKey(name, index);
    if (usedKeys.has(slotKey)) slotKey = `${slotKey}_${index + 1}`;
    usedKeys.add(slotKey);
    return { title, name, icon: readString(source.icon), titleWidth: readString(source.titleWidth), preload: readBoolean(source.preload), slotKey };
  });
}
function syncSlots(block: VisualEditorBlockData, props: Record<string, any>, panes: TabPaneConfig[]) {
  const cachedSlots = (tabsSlotCache[block._vid] ??= {});
  const currentSlots = (props.slots ??= {});
  const nextKeys = new Set<string>();
  panes.forEach((pane) => {
    nextKeys.add(pane.slotKey);
    const currentSlot = currentSlots[pane.slotKey] || cachedSlots[pane.slotKey];
    if (!currentSlots[pane.slotKey]) {
      currentSlots[pane.slotKey] = { key: pane.slotKey, label: pane.title, children: currentSlot?.children || [] };
    } else {
      currentSlots[pane.slotKey].key = pane.slotKey;
      currentSlots[pane.slotKey].label = pane.title;
      currentSlots[pane.slotKey].children = currentSlot?.children || [];
    }
    cachedSlots[pane.slotKey] = currentSlots[pane.slotKey];
  });
  Object.keys(currentSlots).forEach((slotKey) => {
    if (!nextKeys.has(slotKey)) { cachedSlots[slotKey] = currentSlots[slotKey]; delete currentSlots[slotKey]; }
  });
}

export default {
  key: 'vxe-tabs',
  moduleName: 'containerComponents',
  label: 'VXE页签容器',
  preview: () => (
    <div class={styleModule.preview}>
      <div class={styleModule.previewTabs}><span class={styleModule.previewTabActive}>基础信息</span><span class={styleModule.previewTab}>详细信息</span></div>
      <div class={styleModule.previewBody}>拖拽组件到页签内容区</div>
    </div>
  ),
  render({ props, styles, block }) {
    const slots = useSlots();
    const { registerRef } = useGlobalProperties();
    const activeName = ref('');
    watchEffect(() => {
      const panes = normalizePanes(props.panes);
      const paneNames = panes.map((pane) => pane.name);
      const propActiveName = readString(props.modelValue);
      const nextActiveName = paneNames.includes(propActiveName) ? propActiveName : panes[0]?.name;
      if (nextActiveName && props.modelValue !== nextActiveName) props.modelValue = nextActiveName;
      activeName.value = nextActiveName || '';
    });
    return () => {
      const panes = normalizePanes(props.panes);
      syncSlots(block, props, panes);
      const fillRemaining = block.layout?.fillRemaining === true || props.layout?.fillRemaining === true;
      return (
        <div class={[styleModule.tabsWrapper, fillRemaining ? styleModule.fillRemaining : '']} style={styles}>
          <VxeTabsComponent
            ref={(el) => registerRef(el, block._vid)}
            class={styleModule.tabs}
            modelValue={activeName.value}
            width={props.width || undefined}
            height={fillRemaining ? props.height || '100%' : props.height || undefined}
            type={props.type || undefined}
            position={props.position || undefined}
            titleWidth={props.titleWidth || undefined}
            titleAlign={props.titleAlign || undefined}
            destroyOnClose={Boolean(props.destroyOnClose)}
            showClose={Boolean(props.showClose)}
            showBody={props.showBody !== false}
            padding={props.padding !== false}
            trigger={props.trigger || undefined}
            onUpdate:modelValue={(value: string | number | boolean) => {
              const nextValue = String(value); activeName.value = nextValue; props.modelValue = nextValue;
            }}
          >
            {panes.map((pane) => (
              <VxeTabPaneComponent key={pane.slotKey} title={pane.title} name={pane.name} icon={pane.icon || undefined} titleWidth={pane.titleWidth || undefined} preload={Boolean(pane.preload)}>
                <div class={styleModule.paneBody}>{renderSlot(slots, pane.slotKey)}</div>
              </VxeTabPaneComponent>
            ))}
          </VxeTabsComponent>
        </div>
      );
    };
  },
  resize: { height: true, width: true },
} as VisualEditorComponent;
