<template>
  <section class="visual-designer-page" :class="designerThemeClass" :style="designerThemeStyle">
    <div class="visual-designer-frame">
      <div v-if="loading" class="content-panel">
        <p class="page-description">正在加载低代码设计器...</p>
      </div>

      <div v-else-if="errorMessage" class="content-panel">
        <h2 class="page-title">设计器不可用</h2>
        <p class="page-description">{{ errorMessage }}</p>
      </div>

      <ClientOnly v-else>
        <VisualEditorProvider
          v-if="ready"
          ref="providerRef"
          :key="providerKey"
          :initial-data="visualModel"
          :page-record="designerPageRecord"
          @save="saveVisualProject"
        >
          <template #meta>
            <div class="visual-designer-summary">
              <strong>{{ form.title || '未命名页面' }}</strong>
              <span v-if="message" :class="['visual-designer-message', messageType]">
                {{ message }}
              </span>
              <span v-else>{{ form.code }} · {{ form.route }}</span>
            </div>
          </template>

          <template #actions>
            <div class="visual-designer-toolbar lc-actions">
              <vxe-button size="mini" status="primary" :loading="pagePickerLoading" @click="openPagePicker">
                加载页面
              </vxe-button>
              <vxe-button size="mini" @click="createBlankPage">新建页面</vxe-button>
              <vxe-button size="mini" @click="openPageInfo">页面信息</vxe-button>
              <vxe-button size="mini" :loading="loading" @click="reloadCurrent">刷新当前</vxe-button>
              <vxe-button size="mini" status="primary" :loading="saving" @click="requestSave">
                保存
              </vxe-button>
              <vxe-button size="mini" status="success" :loading="publishing" @click="requestPublish">发布</vxe-button>
              <span @click="goBackToList">
                <vxe-button size="mini">返回列表</vxe-button>
              </span>
            </div>
          </template>
        </VisualEditorProvider>
      </ClientOnly>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VisualEditorProvider from './VisualEditorProvider.vue';
import type {
  LowCodeFormSchema,
  LowCodePageRecord,
  LowCodePageSchema,
} from '../types/lowcode';
import type {
  VisualEditorModelValue,
  VisualEditorPage
} from '../visual-editor/visual-editor.utils';
import { convertLowCodePageSchemaToVisualEditor } from '../lowcode/visual-converters';
import { prepareLowCodePageSchema } from '../lowcode/schema';
import { convertVisualEditorToLowCode } from '../utils/visual-to-lowcode';
import {
  confirmLowCodePage,
  findGlobalDialog,
  openGlobalDialog,
} from '../runtime/global-dialog';
import {
  useLowCodeHost,
  type LowCodeHostRouter,
  type LowCodeHostServiceApi,
  type LowCodeMessages,
  type LowCodeTheme,
} from '../core/host';
import { getLowCodePage } from '../runtime/lowcode-pages';

const props = defineProps<{
  code?: string;
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  backRoute?: string;
}>();

type DesignerPageStatus = 'draft' | 'published' | 'archived';
type DesignerPageForm = {
  code: string;
  route: string;
  title: string;
  description: string;
  status: DesignerPageStatus;
};

function getLowCodeDesignerLoadPageBus() {
  const scope = globalThis as any;
  scope.__enlearnLowCodeDesignerLoadPageBus ??= { subscribers: [] };
  return scope.__enlearnLowCodeDesignerLoadPageBus;
}

function subscribeLowCodeDesignerLoadPage(subscriber: (code: string) => void) {
  const bus = getLowCodeDesignerLoadPageBus();
  bus.subscribers ??= [];
  bus.subscribers.push(subscriber);

  if (bus.pendingCode) {
    const pendingCode = bus.pendingCode;
    bus.pendingCode = '';
    subscriber(pendingCode);
  }

  return () => {
    bus.subscribers = (bus.subscribers ?? []).filter(
      (item: (code: string) => void) => item !== subscriber
    );
  };
}

let unsubscribeDesignerLoadPage: (() => void) | null = null;

const host = useLowCodeHost(() => ({
  serviceApi: props.serviceApi,
  router: props.router,
  locale: props.locale,
  messages: props.messages,
  theme: props.theme,
}));
const t = (key: Parameters<typeof host.t>[0], fallback?: string) => host.t(key, fallback);
const page = ref<LowCodePageRecord | null>(null);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const ready = ref(false);
const providerKey = ref(0);
const providerRef = ref<{
  getSnapshot: () => {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
} | null>(null);
const errorMessage = ref('');
const message = ref('');
const messageType = ref<'success' | 'error'>('success');
const visualModel = ref<VisualEditorModelValue | null>(null);
const loadingPageCode = ref('');
const pagePickerLoading = ref(false);

const designerThemeClass = computed(() => host.getTheme().className);
const designerThemeStyle = computed(() =>
  Object.fromEntries(
    Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])
  )
);

const form = ref<DesignerPageForm>({
  code: props.code || 'visual-admin-page',
  route: props.code ? `/dashboard/low-code/${props.code}` : '/dashboard/low-code/visual-admin-page',
  title: '可视化低代码页面',
  description: '',
  status: 'draft'
});
const designerPageRecord = computed<LowCodePageRecord>(() => {
  const current = page.value;
  const currentSchema = current?.schema;
  const keepAlive = currentSchema?.keepAlive ?? current?.keep_alive ?? true;

  return {
    id: current?.id ?? '',
    code: form.value.code,
    route: form.value.route,
    title: form.value.title,
    description: form.value.description || null,
    layout: current?.layout ?? currentSchema?.layout ?? 'dashboard',
    status: form.value.status,
    keep_alive: keepAlive,
    page_type: current?.page_type ?? currentSchema?.pageType ?? 'custom',
    edit_page_id: current?.edit_page_id ?? null,
    view_name: current?.view_name ?? null,
    table_name: current?.table_name ?? null,
    schema: {
      ...(currentSchema ?? {}),
      code: form.value.code,
      route: form.value.route,
      title: form.value.title,
      description: form.value.description,
      layout: current?.layout ?? currentSchema?.layout ?? 'dashboard',
      status: form.value.status,
      keepAlive,
      dataSources: currentSchema?.dataSources ?? {},
      blocks: currentSchema?.blocks ?? [],
      overlays: currentSchema?.overlays ?? [],
    },
    version: current?.version ?? 0,
    published_at: current?.published_at ?? null,
    created_at: current?.created_at ?? '',
    updated_at: current?.updated_at ?? '',
  };
});
const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '发布', value: 'published' },
  { label: '归档', value: 'archived' }
];
const pageInfoSchema: LowCodeFormSchema = {
  fields: [
    {
      field: 'code',
      label: '页面编码',
      component: 'vxe-input',
      props: { clearable: true },
    },
    {
      field: 'route',
      label: '后台路由',
      component: 'vxe-input',
      props: { clearable: true },
    },
    {
      field: 'title',
      label: '页面标题',
      component: 'vxe-input',
      props: { clearable: true },
    },
    {
      field: 'status',
      label: '状态',
      component: 'vxe-select',
      options: statusOptions,
    },
    {
      field: 'description',
      label: '描述',
      component: 'vxe-textarea',
      props: { rows: 3 },
    },
  ],
  actions: [],
};

const fallbackVisualModel = computed<VisualEditorModelValue>(() => ({
  pages: {
    '/': {
      title: form.value.title || '首页',
      path: '/',
      config: {
        bgColor: '',
        bgImage: '',
        keepAlive: false
      },
      blocks: [],
      overlays: []
    }
  },
  models: [],
  actions: {
    fetch: {
      name: '接口请求',
      apis: []
    },
    dialog: {
      name: '对话框',
      handlers: []
    }
  }
}));

function isVisualEditorModel(value: unknown): value is VisualEditorModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { pages?: unknown }).pages === 'object' &&
    (value as { pages?: unknown }).pages !== null
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSchema(schema: LowCodePageSchema | null | undefined) {
  if (!schema) return fallbackVisualModel.value;
  const converted = convertLowCodePageSchemaToVisualEditor(schema);
  if (!isVisualEditorModel(schema.visualEditor)) return converted;

  const storedPage = schema.visualEditor.pages?.['/'];
  const convertedPage = converted.pages?.['/'];
  if (!storedPage || !convertedPage) return schema.visualEditor;

  const runtimeFormModels = new Map(
    convertedPage.blocks
      .filter((block) => typeof block.props?.blockId === 'string')
      .map((block) => [block.props.blockId, block.props?.formDesignerModel]),
  );
  const patchedBlocks = storedPage.blocks.map((block) => {
    if (isVisualEditorModel(block.props?.formDesignerModel)) return block;
    const fallbackModel = runtimeFormModels.get(block.props?.blockId);
    if (!isVisualEditorModel(fallbackModel)) return block;

    return {
      ...block,
      props: {
        ...block.props,
        formDesignerModel: fallbackModel,
      },
    };
  });

  return {
    ...schema.visualEditor,
    pages: {
      ...schema.visualEditor.pages,
      '/': {
        ...storedPage,
        blocks: patchedBlocks,
      },
    },
  };
}

function fillForm(nextPage: LowCodePageRecord | null) {
  if (!nextPage) return;

  form.value = {
    code: nextPage.code,
    route: nextPage.route,
    title: nextPage.title,
    description: nextPage.description ?? '',
    status: nextPage.status
  };
}

function resetDesignerFrame() {
  loading.value = true;
  ready.value = false;
  errorMessage.value = '';
  message.value = '';
}

function applyVisualPage(nextPage: LowCodePageRecord) {
  page.value = nextPage;
  fillForm(nextPage);
  visualModel.value = normalizeSchema(nextPage.schema);
  ready.value = true;
  providerKey.value += 1;
}

function createPageCode() {
  return `visual-page-${Date.now().toString(36)}`;
}

function createBlankPage() {
  const code = createPageCode();
  loading.value = false;
  errorMessage.value = '';
  page.value = null;
  form.value = {
    code,
    route: `/dashboard/low-code/${code}`,
    title: '可视化低代码页面',
    description: '',
    status: 'draft'
  };
  visualModel.value = fallbackVisualModel.value;
  ready.value = true;
  providerKey.value += 1;
  message.value = '已创建空白设计页。';
  messageType.value = 'success';
}

async function loadPageByCode(code: string) {
  const nextCode = code.trim();
  if (!nextCode || loadingPageCode.value === nextCode) return;
  loadingPageCode.value = nextCode;
  resetDesignerFrame();

  try {
    const nextPage = await getLowCodePage(host.getServiceApi(), {
      code: nextCode,
      includeData: false
    });
    applyVisualPage(nextPage);
    message.value = `已加载 ${nextPage.title || nextPage.code}。`;
    messageType.value = 'success';
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '低代码页面加载失败。';
  } finally {
    loading.value = false;
    if (loadingPageCode.value === nextCode) {
      loadingPageCode.value = '';
    }
  }
}

async function reload(codeOverride?: string) {
  const code =
    typeof codeOverride === 'string'
      ? codeOverride
      : page.value?.code || props.code || '';

  if (code) {
    await loadPageByCode(code);
    return;
  }

  resetDesignerFrame();
  try {
    page.value = null;
    visualModel.value = fallbackVisualModel.value;
    ready.value = true;
    providerKey.value += 1;
  } finally {
    loading.value = false;
  }
}

function reloadCurrent() {
  reload();
}

function handleDesignerLoadPage(code: string) {
  if (!code) return;
  loadPageByCode(code);
}

watch(
  () => props.code,
  (nextCode) => {
    reload(nextCode || '');
  },
  { immediate: true }
);

onMounted(() => {
  unsubscribeDesignerLoadPage = subscribeLowCodeDesignerLoadPage(handleDesignerLoadPage);
});

onBeforeUnmount(() => {
  unsubscribeDesignerLoadPage?.();
  unsubscribeDesignerLoadPage = null;
});

function buildSchema(payload: {
  model: VisualEditorModelValue;
  currentPath: string;
  currentPage: VisualEditorPage;
}) {
  const previousSchema = (page.value?.schema ?? {}) as Partial<LowCodePageSchema>;
  const converted = convertVisualEditorToLowCode(payload.model, payload.currentPage);
  const hasRuntimeBlocks = converted.blocks.length > 0;
  const hasVisualOverlays = Array.isArray(payload.currentPage.overlays);
  const hasRuntimeOverlays = converted.overlays.length > 0;
  const hasRuntimeContent = hasRuntimeBlocks || hasRuntimeOverlays;

  return prepareLowCodePageSchema({
    ...previousSchema,
    code: form.value.code,
    route: form.value.route,
    title: form.value.title,
    description: form.value.description,
    layout: 'dashboard',
    status: form.value.status,
    keepAlive: true,
    config: payload.currentPage.config,
    visualEditor: payload.model,
    dataSources: hasRuntimeContent
      ? converted.dataSources
      : isPlainRecord(previousSchema.dataSources)
        ? previousSchema.dataSources
        : {},
    blocks: hasRuntimeBlocks
      ? converted.blocks
      : Array.isArray(previousSchema.blocks)
        ? previousSchema.blocks
        : [],
    overlays: hasVisualOverlays
      ? converted.overlays
      : Array.isArray(previousSchema.overlays)
        ? previousSchema.overlays
        : []
  });
}

function buildPageSaveData(schema: LowCodePageSchema) {
  const nextVersion = (page.value?.version ?? 0) + 1;
  const publishedAt =
    schema.status === 'published'
      ? new Date().toISOString()
      : page.value?.published_at ?? null;

  return {
    code: schema.code,
    route: schema.route,
    title: schema.title,
    description: schema.description ?? null,
    layout: schema.layout ?? 'dashboard',
    status: schema.status ?? 'draft',
    keep_alive: schema.keepAlive ?? true,
    page_type: schema.pageType ?? 'custom',
    edit_page_id: page.value?.edit_page_id ?? null,
    schema,
    version: nextVersion,
    published_at: publishedAt
  };
}

async function saveLowCodePageItem(schema: LowCodePageSchema) {
  return host.getServiceApi().invoke<LowCodePageRecord>('lowcode', 'saveItem', {
    resource: 'lowcode_pages',
    ...(page.value?.id ? { id: page.value.id } : {}),
    data: buildPageSaveData(schema)
  });
}

async function saveVisualProject(payload: {
  model: VisualEditorModelValue;
  currentPath: string;
  currentPage: VisualEditorPage;
}, overrideStatus?: DesignerPageStatus) {
  if (!form.value.code.trim() || !form.value.route.trim() || !form.value.title.trim()) {
    throw new Error('页面编码、路由和标题不能为空。');
  }

  saving.value = true;
  if (overrideStatus === 'published') {
    publishing.value = true;
  }
  message.value = '';

  try {
    const originalStatus = form.value.status;
    if (overrideStatus) {
      form.value.status = overrideStatus;
    }
    const schema = buildSchema(payload);
    const saved = await saveLowCodePageItem(schema);

    page.value = saved;
    fillForm(saved);
    message.value = `已保存 ${saved.code}，版本 ${saved.version}。`;
    messageType.value = 'success';
    if (!overrideStatus) {
      form.value.status = originalStatus;
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败。';
    messageType.value = 'error';
    throw error;
  } finally {
    saving.value = false;
    publishing.value = false;
  }
}

async function requestSave() {
  if (saving.value) return;

  try {
    const snapshot = providerRef.value?.getSnapshot();
    if (!snapshot) {
      throw new Error('请等待设计器初始化完成后再保存。');
    }

    await saveVisualProject(snapshot);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败。';
    messageType.value = 'error';
  }
}

async function requestPublish() {
  if (saving.value) return;

  try {
    const snapshot = providerRef.value?.getSnapshot();
    if (!snapshot) {
      throw new Error('请等待设计器初始化完成后再发布。');
    }

    await saveVisualProject(snapshot, 'published');
  } catch (error) {
    message.value = error instanceof Error ? error.message : '发布失败。';
    messageType.value = 'error';
  }
}

async function openPagePicker() {
  if (findGlobalDialog('lowcode-page-picker')) return;

  pagePickerLoading.value = true;
  message.value = '';

  try {
    const result = await confirmLowCodePage({
      pageCode: 'lowcode-pages',
      includeData: true,
      serviceApi: host.getServiceApi(),
      router: host.getRouter(),
      route: host.getRoute(),
      locale: props.locale,
      messages: props.messages,
      theme: props.theme,
      title: '加载页面',
      confirmLabel: '加载',
      requireSelection: true,
      dialog: {
        id: 'lowcode-page-picker',
        className: 'visual-designer-dialog',
      },
    });

    if (result.action === 'cancel' || result.action === 'close') return;

    const code = readPageCodeFromPickerResult(result.payload);
    if (!code) {
      message.value = '请先选择要加载的页面。';
      messageType.value = 'error';
      return;
    }

    await loadPageByCode(code);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '页面列表加载失败。';
    messageType.value = 'error';
  } finally {
    pagePickerLoading.value = false;
  }
}

function readPageCodeFromPickerResult(payload: unknown) {
  if (!isPlainRecord(payload)) return '';

  const row = [
    payload.row,
    payload.selectedRow,
    payload.currentRow,
    Array.isArray(payload.selectedRows) ? payload.selectedRows[0] : undefined,
    Array.isArray(payload.rows) ? payload.rows[0] : undefined,
  ].find(isPlainRecord);

  return typeof row?.code === 'string' ? row.code.trim() : '';
}

function normalizePageInfoForm(value: Record<string, unknown>): DesignerPageForm {
  const status = String(value.status ?? 'draft');

  return {
    code: String(value.code ?? ''),
    route: String(value.route ?? ''),
    title: String(value.title ?? ''),
    description: String(value.description ?? ''),
    status: ['draft', 'published', 'archived'].includes(status)
      ? (status as DesignerPageStatus)
      : 'draft',
  };
}

function openPageInfo() {
  if (findGlobalDialog('lowcode-page-info')) return;

  void openGlobalDialog<DesignerPageForm>({
    id: 'lowcode-page-info',
    title: '页面信息',
    width: 'min(760px, calc(100vw - 48px))',
    showFooter: true,
    model: { ...form.value },
    form: {
      schema: pageInfoSchema,
    },
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '确定',
        role: 'confirm',
        status: 'primary',
      },
    ],
    onConfirm: ({ model }) => {
      form.value = normalizePageInfoForm(model);
      message.value = '页面信息已更新。';
      messageType.value = 'success';
    },
  });
}

async function goBackToList() {
  await host.getRouter().push(props.backRoute ?? '/dashboard/low-code');
}

</script>
