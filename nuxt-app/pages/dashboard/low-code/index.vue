<template>
  <section class="stack">
    <div class="content-panel">
      <div class="dashboard-topbar">
        <div>
          <h2 class="page-title">Low Code Studio</h2>
          <p class="page-description">
            Manage database-backed page schemas and keep admin screens out of Vue templates.
          </p>
        </div>
        <div class="lc-actions">
          <RouterLink to="/dashboard/low-code/designer">
            <vxe-button status="primary">Visual Designer</vxe-button>
          </RouterLink>
          <RouterLink v-if="selectedCode" :to="`/dashboard/low-code/designer/${selectedCode}`">
            <vxe-button>Edit Selected</vxe-button>
          </RouterLink>
        </div>
      </div>

      <LowCodeGrid
        :schema="pagesGridSchema"
        :rows="pages"
        :loading="loadingPages"
        @toolbar="handlePagesToolbar"
        @edit="selectPage"
        @delete="archivePage"
      />
    </div>

    <div class="content-panel">
      <h3 class="page-title">Generate List Page</h3>
      <div class="lowcode-generator-form">
        <label>
          <span>Feature / Table</span>
          <vxe-select
            v-model="generatorForm.tableName"
            :options="generatorOptions"
            :loading="loadingGeneratorOptions"
            filterable
            clearable
          />
        </label>
        <label>
          <span>Page Code</span>
          <vxe-input v-model="generatorForm.code" clearable />
        </label>
        <label>
          <span>Route</span>
          <vxe-input v-model="generatorForm.route" clearable />
        </label>
        <label>
          <span>Title</span>
          <vxe-input v-model="generatorForm.title" clearable />
        </label>
        <div class="lowcode-generator-form__actions lc-actions">
          <vxe-button :loading="loadingGeneratorOptions" @click="loadGeneratorOptions">
            Refresh
          </vxe-button>
          <vxe-button
            status="primary"
            :loading="generatingPage"
            :disabled="!generatorForm.tableName"
            @click="generateTablePage"
          >
            Generate
          </vxe-button>
        </div>
      </div>
    </div>

    <div class="two-column">
      <div class="content-panel">
        <h3 class="page-title">{{ editingLabel }}</h3>
        <p class="page-description">
          Edit the metadata object that will be stored in `lowcode_pages.schema`.
        </p>

        <LowCodeForm
          v-model="pageForm"
          :schema="pageEditorSchema"
          :loading="saving"
          @submit="savePage"
          @action="handleEditorAction"
        />
      </div>

      <div class="content-panel">
        <h3 class="page-title">Schema Preview</h3>
        <p class="page-description">
          The JSON below is what gets persisted and later rendered dynamically.
        </p>

        <pre class="lc-json-preview">{{ schemaPreview }}</pre>
      </div>
    </div>

    <p v-if="message" :class="messageClass">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  lowCodePageEditorSchema as pageEditorSchema,
  lowCodePagesGridSchema as pagesGridSchema
} from '~/schemas/lowcode';
import { prepareLowCodePageSchema } from '@enlearn/lowcode-framework/lowcode/schema';
import type { LowCodePageOpenType, LowCodePageRecord, LowCodePageType } from '@enlearn/lowcode-framework/types/lowcode';

type LowCodePageForm = {
  code: string;
  route: string;
  title: string;
  pageType: LowCodePageType;
  description: string;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  parentListPageCode: string;
  editOpenType: LowCodePageOpenType;
  schemaJson: string;
};

type TablePageOption = {
  label: string;
  value: string;
  tableName: string;
  title: string;
  pageCode?: string;
  routePath?: string;
};

type GeneratorForm = {
  tableName: string;
  code: string;
  route: string;
  title: string;
};

const emptySchema = {
  schemaVersion: 1,
  code: '',
  route: '',
  title: '',
  pageType: 'custom',
  description: '',
  layout: 'dashboard',
  status: 'draft',
  keepAlive: true,
  blocks: [],
  dataSources: {}
};

const serviceApi = useServiceApi();
const loadingPages = ref(false);
const loadingGeneratorOptions = ref(false);
const saving = ref(false);
const generatingPage = ref(false);
const message = ref('');
const messageClass = ref('lc-help');
const pages = ref<LowCodePageRecord[]>([]);
const selectedCode = ref('');
const generatorOptions = ref<TablePageOption[]>([]);
const generatorForm = ref<GeneratorForm>({
  tableName: '',
  code: '',
  route: '',
  title: ''
});
const pageForm = ref<LowCodePageForm>(createEmptyPageForm());

const editingLabel = computed(() =>
  selectedCode.value ? `Editing ${selectedCode.value}` : 'Create New Page'
);
const schemaPreview = computed(() => pageForm.value.schemaJson || '{}');

function createEmptyPageForm(): LowCodePageForm {
  return {
    code: '',
    route: '',
    title: '',
    pageType: 'custom',
    description: '',
    layout: 'dashboard',
    status: 'draft',
    keep_alive: true,
    parentListPageCode: '',
    editOpenType: 'page',
    schemaJson: JSON.stringify(emptySchema, null, 2)
  };
}

function defaultPageCodeForTable(tableName: string) {
  return tableName
    .replace(/[^A-Za-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function applyGeneratorOption(option: TablePageOption) {
  const code = option.pageCode || defaultPageCodeForTable(option.tableName);
  generatorForm.value = {
    tableName: option.tableName,
    code,
    route: option.routePath || `/dashboard/low-code/${code}`,
    title: option.title || option.tableName
  };
}

function normalizeFormFromPage(page: LowCodePageRecord | null): LowCodePageForm {
  if (!page) return createEmptyPageForm();

  const incomingEditRelation = page.relations?.incoming.find(
    (relation) => relation.actionKey === 'edit'
  );

  return {
    code: page.code,
    route: page.route,
    title: page.title,
    pageType: page.schema.pageType ?? 'custom',
    description: page.description ?? '',
    layout: page.layout,
    status: page.status,
    keep_alive: page.keep_alive,
    parentListPageCode: incomingEditRelation?.sourcePageCode ?? '',
    editOpenType: incomingEditRelation?.openType ?? 'page',
    schemaJson: JSON.stringify(page.schema, null, 2)
  };
}

async function loadPages() {
  loadingPages.value = true;
  try {
    pages.value = await serviceApi.invoke<LowCodePageRecord[]>(
      'lowcode',
      'listPages'
    );

    if (!selectedCode.value && pages.value.length) {
      await selectPage(pages.value[0]);
    }
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not load low code pages.';
    messageClass.value = 'lc-error';
  } finally {
    loadingPages.value = false;
  }
}

async function loadGeneratorOptions() {
  loadingGeneratorOptions.value = true;
  try {
    generatorOptions.value = await serviceApi.invoke<TablePageOption[]>(
      'lowcode',
      'listTablePageOptions'
    );

    if (!generatorForm.value.tableName && generatorOptions.value.length) {
      applyGeneratorOption(generatorOptions.value[0]);
    }
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not load table options.';
    messageClass.value = 'lc-error';
  } finally {
    loadingGeneratorOptions.value = false;
  }
}

async function selectPage(row: Record<string, unknown>) {
  const page = row as LowCodePageRecord;
  selectedCode.value = page.code;
  pageForm.value = normalizeFormFromPage(page);
  message.value = '';
}

async function archivePage(row: Record<string, unknown>) {
  const page = row as LowCodePageRecord;
  saving.value = true;
  message.value = '';

  try {
    await serviceApi.invoke('lowcode', 'archivePage', { code: page.code });
    message.value = `Archived ${page.code}.`;
    messageClass.value = 'lc-help';
    await loadPages();
    if (selectedCode.value === page.code) {
      selectedCode.value = '';
      pageForm.value = normalizeFormFromPage(null);
    }
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not archive the page.';
    messageClass.value = 'lc-error';
  } finally {
    saving.value = false;
  }
}

function buildSchemaPayload(values: LowCodePageForm) {
  const parsedSchema = JSON.parse(values.schemaJson || '{}') as Record<string, unknown>;

  return prepareLowCodePageSchema({
    ...parsedSchema,
    code: values.code,
    route: values.route,
    title: values.title,
    pageType: values.pageType,
    description: values.description,
    layout: values.layout,
    status: values.status,
    keepAlive: values.keep_alive
  });
}

async function savePage(values: Record<string, unknown>) {
  saving.value = true;
  message.value = '';

  try {
    const formValues = values as unknown as LowCodePageForm;
    if (formValues.pageType === 'edit' && !formValues.parentListPageCode.trim()) {
      throw new Error('Edit Page must be linked to a Parent List Page.');
    }

    const schema = buildSchemaPayload(formValues);

    const saved = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'savePage', {
      code: formValues.code,
      schema,
      ...(formValues.parentListPageCode.trim()
        ? {
            parentListPageCode: formValues.parentListPageCode.trim(),
            editOpenType: formValues.editOpenType
          }
        : {})
    });

    selectedCode.value = saved.code;
    pageForm.value = normalizeFormFromPage(saved);
    message.value = `Saved ${saved.code} successfully.`;
    messageClass.value = 'lc-help';
    await loadPages();
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not save the page.';
    messageClass.value = 'lc-error';
  } finally {
    saving.value = false;
  }
}

async function generateTablePage() {
  if (!generatorForm.value.tableName) return;

  generatingPage.value = true;
  message.value = '';

  try {
    const saved = await serviceApi.invoke<LowCodePageRecord>(
      'lowcode',
      'saveGeneratedTableListPage',
      {
        tableName: generatorForm.value.tableName,
        code: generatorForm.value.code,
        route: generatorForm.value.route,
        title: generatorForm.value.title,
        status: 'published'
      }
    );
    selectedCode.value = saved.code;
    pageForm.value = normalizeFormFromPage(saved);
    message.value = `Generated ${saved.code} from ${generatorForm.value.tableName}.`;
    messageClass.value = 'lc-help';
    await loadPages();
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not generate the page.';
    messageClass.value = 'lc-error';
  } finally {
    generatingPage.value = false;
  }
}

async function handleEditorAction(action: { code: string }) {
  if (action.code === 'publish') {
    saving.value = true;
    message.value = '';

    try {
      await serviceApi.invoke('lowcode', 'publishPage', {
        code: pageForm.value.code,
        schema: buildSchemaPayload(pageForm.value),
        ...(pageForm.value.parentListPageCode.trim()
          ? {
              parentListPageCode: pageForm.value.parentListPageCode.trim(),
              editOpenType: pageForm.value.editOpenType
            }
          : {})
      });
      message.value = `Published ${pageForm.value.code}.`;
      messageClass.value = 'lc-help';
      await loadPages();
    } catch (error) {
      message.value =
        error instanceof Error ? error.message : 'Could not publish the page.';
      messageClass.value = 'lc-error';
    } finally {
      saving.value = false;
    }
  }

  if (action.code === 'archive') {
    await archivePage({ code: pageForm.value.code } as Record<string, unknown>);
  }
}

function handlePagesToolbar(code: string) {
  if (code === 'refresh') {
    loadPages();
  }
}

watch(
  () => pageForm.value.schemaJson,
  () => {
    message.value = '';
  }
);

watch(
  () => generatorForm.value.tableName,
  (tableName) => {
    const option = generatorOptions.value.find((item) => item.tableName === tableName);
    if (option) {
      applyGeneratorOption(option);
    }
  }
);

onMounted(async () => {
  await Promise.all([loadPages(), loadGeneratorOptions()]);
});
</script>

<style scoped>
.lowcode-generator-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

.lowcode-generator-form label {
  display: grid;
  gap: 6px;
  color: #344054;
  font-size: 12px;
  min-width: 0;
}

.lowcode-generator-form__actions {
  display: flex;
  justify-content: flex-start;
}

@media (max-width: 960px) {
  .lowcode-generator-form {
    grid-template-columns: 1fr;
  }
}
</style>
