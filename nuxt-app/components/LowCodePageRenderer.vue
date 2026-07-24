<template>
  <div :class="pageShellClass" :style="pageShellStyle">
    <div :class="pageClass">
      <section v-if="showPageIntro" class="page-intro">
        <h1>{{ page.schema.title }}</h1>
        <p>{{ page.schema.description ?? page.description ?? '' }}</p>
      </section>

      <section v-if="dataLoading" class="content-panel">
        <p class="page-description">{{ loadingText }}</p>
      </section>

      <LowCodeBlockRenderer
        v-for="block in page.schema.blocks"
        :key="block.id"
        :block="block"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="
          ({ block: formBlock, values }) => handleFormSubmit(formBlock, values)
        "
        @form-action="
          ({ block: formBlock, action, values }) =>
            handleFormAction(formBlock, action, values)
        "
        @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
        @grid-delete="
          ({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)
        "
        @toolbar-action="({ action }) => handleToolbarAction(action)"
        @search-submit="
          ({ block: searchBlock, values }) =>
            handleSearchSubmit(searchBlock, values)
        "
        @search-action="
          ({ block: searchBlock, action, values }) =>
            handleSearchAction(searchBlock, action, values)
        "
      />

      <p v-if="message" :class="messageClass">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Provider } from '@supabase/supabase-js';
import type {
  LowCodeAction,
  LowCodePageBlock,
  LowCodePageRecord,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageSearchFormBlock
} from '~/types/lowcode';

const props = defineProps<{
  page: LowCodePageRecord & {
    resolvedData?: Record<string, unknown>;
  };
}>();

const route = useRoute();
const router = useRouter();
const serviceApi = useServiceApi();
const auth = useAuth();
const loadingBlockId = ref('');
const loadingGridId = ref('');
const message = ref('');
const messageClass = ref('lc-help');
const dataLoading = ref(false);
const resolvedData = reactive<Record<string, unknown>>({});
const formModels = reactive<Record<string, Record<string, unknown>>>({});
const searchFilters = reactive<Record<string, Record<string, unknown>>>({});
let loadSequence = 0;

const pageConfig = computed(() => props.page.schema.config ?? {});
const pageShellClass = computed(() => pageConfig.value.shellClass);
const pageClass = computed(() =>
  ['lowcode-runtime-page', pageConfig.value.pageClass].filter(Boolean)
);
const pageShellStyle = computed(() => {
  const style: Record<string, string> = {};

  if (pageConfig.value.bgColor) {
    style.backgroundColor = pageConfig.value.bgColor;
  }

  if (pageConfig.value.bgImage) {
    style.backgroundImage = `url(${pageConfig.value.bgImage})`;
  }

  return Object.keys(style).length ? style : undefined;
});
const showPageIntro = computed(() => pageConfig.value.showIntro !== false);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clearObject(target: Record<string, unknown>) {
  Object.keys(target).forEach((key) => delete target[key]);
}

function readPath(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function resolveExpression(expression: string, row: Record<string, unknown> = {}) {
  if (expression.startsWith('row.')) {
    return readPath(row, expression.slice(4));
  }

  if (expression.startsWith('route.')) {
    return readPath(
      {
        query: route.query,
        params: route.params,
        path: route.path,
        fullPath: route.fullPath
      },
      expression.slice(6)
    );
  }

  return undefined;
}

function resolveRuntimeValue(value: unknown, row: Record<string, unknown> = {}): unknown {
  if (typeof value === 'string') {
    const singleExpression = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (singleExpression) {
      return resolveExpression(singleExpression[1], row) ?? '';
    }

    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) =>
      String(resolveExpression(expression, row) ?? '')
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveRuntimeValue(item, row));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveRuntimeValue(item, row)])
    );
  }

  return value;
}

function resolveRuntimePostData(postData?: Record<string, unknown>) {
  return resolveRuntimeValue(postData ?? {}) as Record<string, unknown>;
}

function resolveRuntimeRoute(path: string, row: Record<string, unknown> = {}) {
  return resolveRuntimeValue(path, row) as string;
}

function getActionErrorMessage(action: LowCodeAction, fallback: string) {
  return action.handler?.errorMessage ?? fallback;
}

function setSuccessMessage(messageText?: string) {
  if (!messageText) return;
  message.value = messageText;
  messageClass.value = 'lc-help';
}

async function executeActionRoute(
  action: LowCodeAction,
  values: Record<string, unknown> = {}
) {
  if (!action.route) {
    return false;
  }

  await router.push(resolveRuntimeRoute(action.route, values));
  return true;
}

async function executeActionHandler(
  action: LowCodeAction,
  values: Record<string, unknown> = {}
) {
  const handler = action.handler;

  if (!handler) {
    return false;
  }

  if (handler.type === 'auth.signInWithPassword') {
    await auth.signInWithPassword({
      email: String(values[handler.emailField ?? 'email'] ?? ''),
      password: String(values[handler.passwordField ?? 'password'] ?? '')
    });
    setSuccessMessage(handler.successMessage);

    if (handler.successRoute) {
      await router.push(resolveRuntimeRoute(handler.successRoute, values));
    }

    return true;
  }

  if (handler.type === 'auth.signUp') {
    await auth.signUp({
      email: String(values[handler.emailField ?? 'email'] ?? ''),
      password: String(values[handler.passwordField ?? 'password'] ?? '')
    });
    setSuccessMessage(handler.successMessage);

    if (handler.successRoute) {
      await router.push(resolveRuntimeRoute(handler.successRoute, values));
    }

    return true;
  }

  if (handler.type === 'auth.signInWithOAuth') {
    await auth.signInWithOAuth(handler.provider as Provider);
    return true;
  }

  return false;
}

function getSubmitAction(block: LowCodePageFormBlock) {
  return (
    block.schema.actions.find((action) => action.type === 'submit') ??
    block.schema.actions.find((action) => action.code === 'submit')
  );
}

function getDataSource(key?: string) {
  if (!key) return undefined;
  return props.page.schema.dataSources?.[key];
}

function getChildBlocks(block: LowCodePageBlock): LowCodePageBlock[] {
  if ('blocks' in block && Array.isArray(block.blocks)) {
    return block.blocks;
  }

  if (block.kind === 'tabs') {
    return block.tabs.flatMap((tab) => tab.blocks);
  }

  return [];
}

function flattenBlocks(blocks: LowCodePageBlock[]): LowCodePageBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(getChildBlocks(block))]);
}

function getFormBlockTarget(block: LowCodePageGridBlock) {
  const blocks = flattenBlocks(props.page.schema.blocks);

  if (block.editorBlockId) {
    const target = blocks.find(
      (pageBlock) => pageBlock.kind === 'form' && pageBlock.id === block.editorBlockId
    );

    if (target && target.kind === 'form') {
      return target;
    }
  }

  return blocks.find(
    (pageBlock): pageBlock is LowCodePageFormBlock => pageBlock.kind === 'form'
  );
}

function deriveFormModel(
  block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
  row?: Record<string, unknown>
) {
  const nextModel = {
    ...(block.initialValues ?? {})
  };

  if (row && isRecord(row)) {
    Object.assign(nextModel, row);
  }

  return nextModel;
}

async function loadPageData(nextPage: LowCodePageRecord) {
  const entries = Object.entries(nextPage.schema.dataSources ?? {});

  clearObject(resolvedData);
  clearObject(formModels);
  clearObject(searchFilters);

  for (const block of flattenBlocks(nextPage.schema.blocks)) {
    if (block.kind === 'form' || block.kind === 'searchForm') {
      formModels[block.id] = deriveFormModel(block);
    }
  }

  if (!entries.length) {
    return [];
  }

  const results = await Promise.allSettled(
    entries.map(async ([key, source]) => {
      if (source.autoLoad === false) {
        return [key, undefined] as const;
      }

      const data = await serviceApi.invoke(
        source.serviceName,
        source.serviceMethod,
        resolveRuntimePostData(source.postData)
      );

      return [key, data] as const;
    })
  );

  const errors: string[] = [];

  results.forEach((result, index) => {
    const [key] = entries[index];

    if (result.status === 'fulfilled') {
      const [resolvedKey, value] = result.value;
      if (typeof value !== 'undefined') {
        resolvedData[resolvedKey] = value;
      }
      return;
    }

    errors.push(
      `${key}: ${result.reason instanceof Error ? result.reason.message : 'Could not load data source.'}`
    );
  });

  for (const block of flattenBlocks(nextPage.schema.blocks)) {
    if (block.kind !== 'form') continue;

    const source = getDataSource(block.sourceKey ?? block.submitSourceKey);
    const sourceValue = source ? resolvedData[source.key] : undefined;

    if (isRecord(sourceValue)) {
      formModels[block.id] = {
        ...formModels[block.id],
        ...sourceValue
      };
    }
  }

  return errors;
}

const loadingText = computed(() =>
  dataLoading.value ? 'Loading page data sources...' : ''
);

watch(
  [() => props.page, () => route.fullPath],
  async ([nextPage]) => {
    const currentLoad = ++loadSequence;
    message.value = '';
    dataLoading.value = true;

    try {
      const errors = await loadPageData(nextPage);

      if (currentLoad !== loadSequence) {
        return;
      }

      if (errors.length) {
        message.value = errors[0];
        messageClass.value = 'lc-error';
      }
    } catch (error) {
      if (currentLoad !== loadSequence) {
        return;
      }

      message.value =
        error instanceof Error ? error.message : 'Could not load low code page.';
      messageClass.value = 'lc-error';
    } finally {
      if (currentLoad === loadSequence) {
        dataLoading.value = false;
      }
    }
  },
  { immediate: true }
);

async function handleFormSubmit(
  block: LowCodePageBlock,
  values: Record<string, unknown>
) {
  if (block.kind !== 'form') return;
  const submitAction = getSubmitAction(block);
  const source = getDataSource(block.submitSourceKey ?? block.sourceKey);

  if (!source && !submitAction?.handler && !submitAction?.route) {
    return;
  }

  loadingBlockId.value = block.id;
  message.value = '';

  try {
    if (
      submitAction &&
      ((await executeActionRoute(submitAction, values)) ||
        (await executeActionHandler(submitAction, values)))
    ) {
      return;
    }

    if (source) {
      await serviceApi.invoke(
        source.serviceName,
        source.saveMethod ?? source.serviceMethod,
        {
          ...(source.postData ?? {}),
          ...values
        }
      );
      message.value = 'Saved successfully.';
      messageClass.value = 'lc-help';
      await loadPageData(props.page);
    }
  } catch (error) {
    message.value =
      error instanceof Error
        ? error.message
        : getActionErrorMessage(
            submitAction ?? { code: '', label: '' },
            'Could not submit the form.'
          );
    messageClass.value = 'lc-error';
  } finally {
    loadingBlockId.value = '';
  }
}

async function handleFormAction(
  block: LowCodePageBlock,
  action: LowCodeAction,
  values: Record<string, unknown>
) {
  if (action.code === 'submit') {
    await handleFormSubmit(block, values);
    return;
  }

  if (action.type === 'reset') {
    return;
  }

  loadingBlockId.value = block.id;
  message.value = '';

  try {
    if (await executeActionRoute(action, values)) {
      return;
    }

    await executeActionHandler(action, values);
  } catch (error) {
    message.value =
      error instanceof Error
        ? error.message
        : getActionErrorMessage(action, 'Could not complete the action.');
    messageClass.value = 'lc-error';
  } finally {
    loadingBlockId.value = '';
  }
}

async function handleToolbarAction(action: LowCodeAction) {
  message.value = '';

  try {
    if (await executeActionRoute(action)) {
      return;
    }

    if (await executeActionHandler(action)) {
      return;
    }

    if (action.code === 'refresh') {
      await loadPageData(props.page);
    }
  } catch (error) {
    message.value =
      error instanceof Error
        ? error.message
        : getActionErrorMessage(action, 'Could not complete the action.');
    messageClass.value = 'lc-error';
  }
}

function handleSearchSubmit(
  block: LowCodePageSearchFormBlock,
  values: Record<string, unknown>
) {
  if (!block.targetSourceKey) return;
  searchFilters[block.targetSourceKey] = { ...values };
}

function handleSearchAction(
  block: LowCodePageSearchFormBlock,
  action: LowCodeAction,
  values: Record<string, unknown>
) {
  if (action.type === 'reset' && block.targetSourceKey) {
    searchFilters[block.targetSourceKey] = {};
    return;
  }

  if (action.code === 'submit') {
    handleSearchSubmit(block, values);
  }
}

async function handleGridEdit(
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
  const editRoute = block.editRoute ?? block.schema.rowActions?.editRoute;

  if (editRoute) {
    await router.push(resolveRuntimeRoute(editRoute, row));
    return;
  }

  const formBlock = getFormBlockTarget(block);

  if (!formBlock) {
    return;
  }

  formModels[formBlock.id] = deriveFormModel(formBlock, row);
  message.value = '';
}

async function handleGridDelete(
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
  const source = getDataSource(block.deleteSourceKey ?? block.sourceKey);

  if (!source) {
    return;
  }

  loadingGridId.value = block.id;
  message.value = '';

  try {
    await serviceApi.invoke(source.serviceName, source.deleteMethod ?? source.serviceMethod, {
      ...(source.postData ?? {}),
      ...row
    });
    message.value = 'Deleted successfully.';
    messageClass.value = 'lc-help';
    await loadPageData(props.page);
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not delete the record.';
    messageClass.value = 'lc-error';
  } finally {
    loadingGridId.value = '';
  }
}
</script>
