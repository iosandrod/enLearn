import { createApp, h } from 'vue';
import 'remixicon/fonts/remixicon.css';
import '../assets/styles/app.css';
import LowCodePageRenderer from '../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue';
import type { LowCodeHostServiceApi } from '../../packages/lowcode-framework/src/core/host';
import type { LowCodeRuntimeEvent } from '../../packages/lowcode-framework/src/types/lowcode';
import type { LowCodePageRecord } from '../../packages/lowcode-framework/src/types/lowcode';

const calls: Array<{
  serviceName: string;
  serviceMethod: string;
  payload?: Record<string, unknown>;
}> = [];

const page: LowCodePageRecord = {
  id: 'category-drawer-page',
  code: 'category-drawer-page',
  route: '/tests/category-drawer',
  title: '物料档案',
  description: null,
  layout: 'default',
  status: 'published',
  keep_alive: true,
  page_type: 'list',
  edit_page_id: null,
  view_name: null,
  table_name: 'planning_item',
  relate_config: { category: 'item' },
  schema: {
    code: 'category-drawer-page',
    route: '/tests/category-drawer',
    title: '物料档案',
    blocks: [{
      id: 'page-content',
      kind: 'section',
      title: '物料档案',
      description: '类别抽屉右侧的页面主体',
      blocks: [{
        id: 'page-copy',
        kind: 'text',
        content: '当前页面内容',
      }, {
        id: 'materials-grid',
        kind: 'grid',
        title: '物料列表',
        sourceKey: 'materials',
        tableType: 'main',
        categoryField: 'category_id',
        schema: {
          grid: {
            columns: [{ field: 'name', title: '名称' }],
          },
        },
      }],
    }],
    dataSources: {
      materials: {
        key: 'materials',
        serviceName: 'admin',
        serviceMethod: 'listItems',
        postData: { resource: 'planning_item' },
        autoLoad: false,
      },
    },
  },
  version: 1,
  published_at: null,
  created_at: '2026-08-17T00:00:00.000Z',
  updated_at: '2026-08-17T00:00:00.000Z',
};

const serviceApi: LowCodeHostServiceApi = {
  async invoke<T = unknown>(
    serviceName: string,
    serviceMethod: string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    calls.push({ serviceName, serviceMethod, payload });
    if (serviceName === 'planning' && serviceMethod === 'listRelationOptions') {
      return [
        {
          id: 'raw-materials',
          label: '原材料',
          children: [
            { id: 'boards', label: '板材' },
            { id: 'fasteners', label: '紧固件' },
          ],
        },
        { id: 'finished-goods', label: '成品' },
      ] as T;
    }
    if (serviceName === 'admin' && serviceMethod === 'listItems') {
      return [{ id: 'material-1', name: '板材物料' }] as T;
    }
    return [] as T;
  },
};

const events: LowCodeRuntimeEvent[] = [];
createApp({
  render: () => h(LowCodePageRenderer, {
    page,
    serviceApi,
    locale: 'zh-CN',
    showGlobalDialogHost: false,
    onRuntimeEvent: (event: LowCodeRuntimeEvent) => {
      events.push(event);
    },
  }),
}).mount('#app');

Object.assign(window, {
  __categoryDrawerSmoke: { calls, events, page },
});

document.querySelector('#result')!.textContent = JSON.stringify({ ok: true });

declare global {
  interface Window {
    __categoryDrawerSmoke: {
      calls: typeof calls;
      events: LowCodeRuntimeEvent[];
      page: LowCodePageRecord;
    };
  }
}
