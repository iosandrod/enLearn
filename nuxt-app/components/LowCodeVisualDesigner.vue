<template>
  <section class="visual-designer-page">
    <div class="visual-designer-meta">
      <div class="visual-designer-meta-row">
        <vxe-input v-model="form.code" placeholder="页面编码" clearable />
        <vxe-input v-model="form.route" placeholder="后台路由" clearable />
        <vxe-input v-model="form.title" placeholder="页面标题" clearable />
        <vxe-select v-model="form.status" :options="statusOptions" />
        <div class="lc-actions">
          <vxe-button status="primary" :loading="saving" @click="requestSave">
            保存
          </vxe-button>
          <vxe-button @click="reload">重载</vxe-button>
          <NuxtLink to="/dashboard/low-code">
            <vxe-button>返回列表</vxe-button>
          </NuxtLink>
        </div>
      </div>

      <p v-if="message" :class="['visual-designer-message', messageType]">
        {{ message }}
      </p>
    </div>

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
        />
      </ClientOnly>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { LowCodePageRecord, LowCodePageSchema } from '~/types/lowcode';
import type {
  VisualEditorModelValue,
  VisualEditorPage
} from '@/visual-editor/visual-editor.utils';
import { convertVisualEditorToLowCode } from '~/utils/visual-to-lowcode';

const props = defineProps<{
  code?: string;
}>();

const serviceApi = useServiceApi();
const page = ref<LowCodePageRecord | null>(null);
const loading = ref(true);
const saving = ref(false);
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

const form = ref({
  code: props.code || 'visual-admin-page',
  route: props.code ? `/dashboard/low-code/${props.code}` : '/dashboard/low-code/visual-admin-page',
  title: '可视化低代码页面',
  description: '',
  status: 'draft' as 'draft' | 'published' | 'archived'
});

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '发布', value: 'published' },
  { label: '归档', value: 'archived' }
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
      blocks: []
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
  return isVisualEditorModel(schema.visualEditor) ? schema.visualEditor : fallbackVisualModel.value;
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

async function reload() {
  loading.value = true;
  ready.value = false;
  errorMessage.value = '';
  message.value = '';

  try {
    if (!props.code) {
      page.value = null;
      visualModel.value = fallbackVisualModel.value;
      ready.value = true;
      providerKey.value += 1;
      return;
    }

    page.value = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'getPage', {
      code: props.code,
      includeData: false
    });
    fillForm(page.value);
    visualModel.value = normalizeSchema(page.value.schema);
    ready.value = true;
    providerKey.value += 1;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '低代码页面加载失败。';
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

  return {
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
    dataSources: hasRuntimeBlocks
      ? converted.dataSources
      : isPlainRecord(previousSchema.dataSources)
        ? previousSchema.dataSources
        : {},
    blocks: hasRuntimeBlocks
      ? converted.blocks
      : Array.isArray(previousSchema.blocks)
        ? previousSchema.blocks
        : []
  };
}

async function saveVisualProject(payload: {
  model: VisualEditorModelValue;
  currentPath: string;
  currentPage: VisualEditorPage;
}) {
  if (!form.value.code.trim() || !form.value.route.trim() || !form.value.title.trim()) {
    throw new Error('页面编码、路由和标题不能为空。');
  }

  saving.value = true;
  message.value = '';

  try {
    const schema = buildSchema(payload);
    const saved = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'savePage', {
      code: page.value?.code || form.value.code,
      schema
    });

    page.value = saved;
    fillForm(saved);
    message.value = `已保存 ${saved.code}，版本 ${saved.version}。`;
    messageType.value = 'success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败。';
    messageType.value = 'error';
    throw error;
  } finally {
    saving.value = false;
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

onMounted(reload);
</script>
