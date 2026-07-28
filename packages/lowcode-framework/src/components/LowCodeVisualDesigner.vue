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
              <vxe-button size="mini" :loading="loading" @click="reload">刷新当前</vxe-button>
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

    <vxe-modal
      v-model="pagePickerVisible"
      title="加载页面"
      width="min(1040px, calc(100vw - 48px))"
      height="min(680px, calc(100vh - 96px))"
      show-footer
      resize
    >
      <div class="visual-designer-dialog">
        <div class="visual-designer-dialog-toolbar lc-actions">
          <vxe-button status="primary" :loading="pagePickerLoading" @click="fetchPageRows">
            刷新列表
          </vxe-button>
        </div>
        <vxe-grid
          border
          height="500"
          :loading="pagePickerLoading"
          :data="pagePickerRows"
          :columns="pagePickerColumns"
          :row-config="{ isCurrent: true, keyField: 'id' }"
          @current-row-change="handlePagePickerCurrentChange"
          @row-dblclick="handlePagePickerDblclick"
        />
      </div>
      <template #footer>
        <div class="visual-designer-dialog-footer">
          <vxe-button @click="pagePickerVisible = false">取消</vxe-button>
          <vxe-button
            status="primary"
            :disabled="!selectedPickerPage"
            :loading="loading"
            @click="confirmLoadSelectedPage"
          >
            加载
          </vxe-button>
        </div>
      </template>
    </vxe-modal>

    <vxe-modal
      v-model="pageInfoVisible"
      title="页面信息"
      width="min(760px, calc(100vw - 48px))"
      show-footer
      resize
    >
      <div class="visual-designer-info-form">
        <label>
          <span>页面编码</span>
          <vxe-input v-model="pageInfoDraft.code" clearable />
        </label>
        <label>
          <span>后台路由</span>
          <vxe-input v-model="pageInfoDraft.route" clearable />
        </label>
        <label>
          <span>页面标题</span>
          <vxe-input v-model="pageInfoDraft.title" clearable />
        </label>
        <label>
          <span>状态</span>
          <vxe-select v-model="pageInfoDraft.status" :options="statusOptions" />
        </label>
        <label class="visual-designer-info-form__wide">
          <span>描述</span>
          <vxe-textarea v-model="pageInfoDraft.description" rows="3" />
        </label>
      </div>
      <template #footer>
        <div class="visual-designer-dialog-footer">
          <vxe-button @click="pageInfoVisible = false">取消</vxe-button>
          <vxe-button status="primary" @click="confirmPageInfo">确定</vxe-button>
        </div>
      </template>
    </vxe-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import VisualEditorProvider from './VisualEditorProvider.vue';
import type { LowCodePageRecord, LowCodePageSchema } from '../types/lowcode';
import type {
  VisualEditorModelValue,
  VisualEditorPage
} from '../visual-editor/visual-editor.utils';
import { convertLowCodePageSchemaToVisualEditor } from '../lowcode/visual-converters';
import { prepareLowCodePageSchema } from '../lowcode/schema';
import { convertVisualEditorToLowCode } from '../utils/visual-to-lowcode';
import {
  useLowCodeHost,
  type LowCodeHostRouter,
  type LowCodeHostServiceApi,
  type LowCodeMessages,
  type LowCodeTheme,
} from '../core/host';

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
const pagePickerVisible = ref(false);
const pagePickerLoading = ref(false);
const pagePickerRows = ref<LowCodePageRecord[]>([]);
const selectedPickerPage = ref<LowCodePageRecord | null>(null);
const pageInfoVisible = ref(false);

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
const pageInfoDraft = ref<DesignerPageForm>({
  code: '',
  route: '',
  title: '',
  description: '',
  status: 'draft'
});

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '发布', value: 'published' },
  { label: '归档', value: 'archived' }
];
const pagePickerColumns: Record<string, unknown>[] = [
  { type: 'seq', title: '#', width: 56 },
  { field: 'title', title: '标题', minWidth: 180 },
  { field: 'code', title: '编码', minWidth: 160 },
  { field: 'route', title: '路由', minWidth: 260 },
  { field: 'status', title: '状态', width: 96 },
  { field: 'version', title: '版本', width: 88 },
  { field: 'updated_at', title: '更新时间', width: 190 }
];

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
  return isVisualEditorModel(schema.visualEditor)
    ? schema.visualEditor
    : convertLowCodePageSchemaToVisualEditor(schema);
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
  if (!code) return;
  resetDesignerFrame();

  try {
    const nextPage = await host.getServiceApi().invoke<LowCodePageRecord>('lowcode', 'getPage', {
      code,
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
  }
}

async function reload() {
  const code = page.value?.code || props.code || '';

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
    const saved = await host.getServiceApi().invoke<LowCodePageRecord>('lowcode', 'savePage', {
      code: page.value?.code || form.value.code,
      schema
    });

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

function requestSave() {
  const snapshot = providerRef.value?.getSnapshot();
  if (!snapshot) {
    message.value = '请等待设计器初始化完成后再保存。';
    messageType.value = 'error';
    return;
  }

  saveVisualProject(snapshot).catch(() => undefined);
}

function requestPublish() {
  const snapshot = providerRef.value?.getSnapshot();
  if (!snapshot) {
    message.value = '请等待设计器初始化完成后再发布。';
    messageType.value = 'error';
    return;
  }

  saveVisualProject(snapshot, 'published').catch(() => undefined);
}

async function fetchPageRows() {
  pagePickerLoading.value = true;

  try {
    pagePickerRows.value = await host.getServiceApi().invoke<LowCodePageRecord[]>(
      'lowcode',
      'listPages'
    );
    selectedPickerPage.value = null;
  } catch (error) {
    message.value = error instanceof Error ? error.message : '页面列表加载失败。';
    messageType.value = 'error';
  } finally {
    pagePickerLoading.value = false;
  }
}

async function openPagePicker() {
  selectedPickerPage.value = null;
  pagePickerVisible.value = true;
  await fetchPageRows();
}

function readPagePickerRow(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) return null;
  const row = (payload as { row?: unknown }).row;
  return typeof row === 'object' && row !== null ? (row as LowCodePageRecord) : null;
}

function handlePagePickerCurrentChange(payload: unknown) {
  selectedPickerPage.value = readPagePickerRow(payload);
}

function handlePagePickerDblclick(payload: unknown) {
  const row = readPagePickerRow(payload);
  if (!row) return;
  selectedPickerPage.value = row;
  confirmLoadSelectedPage();
}

async function confirmLoadSelectedPage() {
  if (!selectedPickerPage.value) return;
  const code = selectedPickerPage.value.code;
  pagePickerVisible.value = false;
  await loadPageByCode(code);
}

function openPageInfo() {
  pageInfoDraft.value = { ...form.value };
  pageInfoVisible.value = true;
}

function confirmPageInfo() {
  form.value = { ...pageInfoDraft.value };
  pageInfoVisible.value = false;
  message.value = '页面信息已更新。';
  messageType.value = 'success';
}

async function goBackToList() {
  await host.getRouter().push(props.backRoute ?? '/dashboard/low-code');
}

onMounted(reload);
</script>
