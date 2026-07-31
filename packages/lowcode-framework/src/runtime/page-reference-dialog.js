import { h } from 'vue';
import LowCodePageRenderer from '../components/LowCodePageRenderer.vue';
import {
  getBuiltinLowCodePageByCode,
  getBuiltinLowCodePageByRoute,
} from '../lowcode/builtin-pages';
import { openGlobalDialog } from './global-dialog';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getDefaultServiceApi() {
  if (typeof useServiceApi === 'function') {
    return useServiceApi();
  }

  return undefined;
}

function isMissingLowCodePageError(error) {
  const statusCode = error?.statusCode ?? error?.status;
  const message = [
    error?.statusMessage,
    error?.message,
    error?.data?.message,
    error?.data?.statusMessage,
  ]
    .filter(Boolean)
    .join(' ');

  return statusCode === 404 || message.includes('Low-code page not found');
}

function getBuiltinReferencePage(code, route) {
  return (
    (code ? getBuiltinLowCodePageByCode(code) : null) ??
    (route ? getBuiltinLowCodePageByRoute(route) : null)
  );
}

async function resolveReferencePage(config) {
  if (config.page) return config.page;

  const code = readString(config.pageCode ?? config.code);
  const route = readString(config.pageRoute);
  const builtinPage = getBuiltinReferencePage(code, route);
  const serviceApi = config.serviceApi ?? getDefaultServiceApi();

  if (!serviceApi) {
    if (builtinPage) return builtinPage;
    throw new Error('Low-code serviceApi is not configured.');
  }

  try {
    return await serviceApi.invoke('lowcode', 'getPage', {
      ...(code ? { code } : {}),
      ...(route ? { route } : {}),
      includeData: config.includeData !== false,
    });
  } catch (error) {
    if (builtinPage && isMissingLowCodePageError(error)) {
      return builtinPage;
    }

    throw error;
  }
}

function normalizeSelectEvents(selectOn) {
  const events = Array.isArray(selectOn) ? selectOn : [selectOn ?? 'rowDblclick'];
  return new Set(events.filter(Boolean));
}

function readEventKey(event) {
  const payloadKey = event.payload?.key;
  if (typeof payloadKey === 'string' && payloadKey.trim()) {
    return payloadKey.trim();
  }

  if (event.name === 'grid.rowDblclick') return 'rowDblclick';
  if (event.name === 'grid.cellDblclick') return 'cellDblclick';
  if (event.name === 'grid.rowCurrentChange') return 'rowCurrentChange';
  return '';
}

function readEventRow(event) {
  return isRecord(event.payload?.row) ? event.payload.row : null;
}

function createReferencePayload(row, event, page, config) {
  const valueField = readString(config.valueField);
  const labelField = readString(config.labelField);

  return {
    row,
    ...(valueField ? { value: row[valueField] } : {}),
    ...(labelField ? { label: row[labelField] } : {}),
    event,
    page,
    blockId: event.blockId,
    blockKind: event.blockKind,
  };
}

function mergeDialogClassName(value) {
  return typeof value === 'string' && value.trim()
    ? `lowcode-reference-dialog ${value.trim()}`
    : 'lowcode-reference-dialog';
}

export async function openLowCodePageReferenceDialog(config) {
  const page = await resolveReferencePage(config);
  const selectEvents = normalizeSelectEvents(config.selectOn);
  const resultAction = readString(config.resultAction, 'select');
  const requireSelection = config.requireSelection !== false;
  let selectedPayload;
  let closing = false;

  const result = await openGlobalDialog({
    ...(config.dialog ?? {}),
    title: config.title ?? page.title,
    width: config.width ?? 'min(1360px, calc(100vw - 40px))',
    height: config.height,
    className: mergeDialogClassName(config.className ?? config.dialog?.className),
    props: {
      top: '4vh',
      destroyOnClose: true,
      ...(config.dialog?.props ?? {}),
      ...(config.props ?? {}),
    },
    showFooter: true,
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '确定',
        role: 'custom',
        status: 'primary',
        onClick: () => {
          if (!selectedPayload && requireSelection) return false;
          return {
            close: true,
            action: selectedPayload ? resultAction : 'confirm',
            payload: selectedPayload,
          };
        },
      },
    ],
    content: {
      type: 'render',
      render: (context) =>
        h(
          'div',
          { class: 'lc-global-dialog__page-reference' },
          h(LowCodePageRenderer, {
            page,
            serviceApi: config.serviceApi,
            router: config.router,
            route: config.route,
            locale: config.locale,
            messages: config.messages,
            theme: config.theme,
            showGlobalDialogHost: false,
            onRuntimeEvent: async (event) => {
              const row = readEventRow(event);
              if (!row) return;

              const payload = createReferencePayload(row, event, page, config);
              const eventKey = readEventKey(event);
              if (eventKey === 'rowCurrentChange') {
                selectedPayload = payload;
              }

              if (!selectEvents.has(eventKey) || closing) return;

              closing = true;
              selectedPayload = payload;
              await context.close({
                action: resultAction,
                payload,
              });
            },
          }),
        ),
    },
  });

  return result;
}
