import assert from 'node:assert/strict';

const apiBaseUrl = process.env.ENLEARN_MOBILE_API_URL ?? 'http://127.0.0.1:3002/api';
const login = process.env.ENLEARN_MOBILE_E2E_LOGIN ?? 'admin';
const password = process.env.ENLEARN_MOBILE_E2E_PASSWORD ?? '123456';
const allowedMaterials = new Set([
  'text', 'container', 'section', 'form', 'searchForm', 'grid', 'detail',
  'statCard', 'tabs', 'toolbar', 'buttonGroup', 'modal', 'drawer', 'tree',
]);
const allowedDirectives = new Set([
  'navigate', 'routePush', 'showMessage', 'refreshPage', 'refreshDataSource',
  'refreshDataSources', 'invokeService', 'invokePageApi', 'callPageApi',
  'setDataSource', 'updateDataSource', 'setGridRows', 'updateGridRows',
  'setFormValues', 'updateFormModel', 'setFormData', 'updateFormData',
  'setFormField', 'updateFormField', 'setSearchFilters', 'updateSearchFilters',
  'emitEvent', 'openBlock', 'openModal', 'closeBlock', 'closeModal',
  'toggleModal', 'openGlobalDialog', 'openDialog', 'openPageReferenceDialog',
  'openLowCodePageReferenceDialog', 'openReferenceDialog', 'invokeNative',
  'scanCode', 'capturePhoto', 'pickImage', 'pickFile', 'dispatchWindowEvent',
  'dispatchBrowserEvent',
]);

const unavailableEmptyListMethods = new Set([
  'listSystemExecutionTasks',
  'listWorkflowTimerJobs',
]);

function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeDataSourceRequest(source) {
  let serviceName = readString(source.serviceName);
  let serviceMethod = readString(source.serviceMethod);
  const postData = { ...(source.postData ?? {}) };
  const tableName = readString(source.tableName ?? source.table_name);
  const entityCode = readString(source.entityCode ?? source.entity_code);
  if (!serviceName && (tableName || entityCode)) serviceName = 'admin';
  if (!serviceMethod && (tableName || entityCode)) serviceMethod = 'listItems';
  if (tableName) postData.tableName = tableName;
  if (entityCode) postData.entityCode = entityCode;

  const adminTables = {
    listUsers: 'users', listRoles: 'admin_roles', listPermissions: 'admin_permissions',
    listRoutes: 'admin_routes', listRouteTree: 'admin_routes', listRouteManageTree: 'admin_routes',
    listEntities: 'admin_entities', listPages: 'lowcode_pages',
    listOptionSources: 'system_option_sources', listOptionItems: 'system_option_items',
  };
  const workflowTypes = {
    listSystemExecutionTasks: 'jobs', listWorkflowJobs: 'jobs',
    listWorkflowJobRuns: 'jobRuns', listWorkflowTimerJobs: 'jobs',
  };
  const notificationResources = {
    listMessages: 'notification_messages', getPreferences: 'notification_preferences',
    listDeliveries: 'notification_deliveries',
  };
  const originalServiceMethod = serviceMethod;

  if (serviceName === 'admin' && workflowTypes[serviceMethod]) {
    const itemType = workflowTypes[serviceMethod];
    const requestedLimit = Number(postData.limit ?? postData.pageSize ?? postData.page_size);
    serviceName = 'workflow';
    serviceMethod = 'listItems';
    postData.itemType = itemType;
    if (itemType === 'jobRuns') {
      const limit = Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 50, 100);
      postData.limit = limit;
      postData.pageSize = limit;
    }
    if (originalServiceMethod === 'listWorkflowTimerJobs') {
      postData.filters = { ...(postData.filters ?? {}), type: 'cron' };
    }
  } else if (serviceName === 'admin' && adminTables[serviceMethod]) {
    postData.tableName = readString(postData.tableName ?? postData.table_name, adminTables[serviceMethod]);
    serviceMethod = 'listItems';
  } else if (serviceName === 'lowcode' && serviceMethod === 'listPages') {
    postData.tableName = readString(postData.tableName ?? postData.table_name, 'lowcode_pages');
    serviceMethod = 'listItems';
  } else if (serviceName === 'lowcode' && ['listTableRows', 'listRows', 'listTableData'].includes(serviceMethod)) {
    serviceName = 'admin';
    serviceMethod = 'listItems';
  } else if (serviceName === 'notification' && notificationResources[serviceMethod]) {
    postData.resource = readString(postData.resource, notificationResources[serviceMethod]);
    serviceMethod = 'listItems';
  } else if (serviceName === 'files' && serviceMethod === 'listStorageEntities') {
    postData.resource = readString(postData.resource, 'file_objects');
    postData.operation = readString(postData.operation, 'listStorageEntities');
    serviceMethod = 'runAction';
  }

  return { serviceName, serviceMethod, postData, originalServiceMethod };
}

async function jsonRequest(path, init) {
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/${path}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message ?? `${path} failed with ${response.status}`);
  return payload;
}

const accountOptions = await jsonRequest(`auth/account-options?login=${encodeURIComponent(login)}`);
const accountId = accountOptions.accounts?.[0]?.account_id;
assert.ok(accountId, 'the audit account must have an active account set');
const auth = await jsonRequest('auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: login, password, accountId, setDefault: false }),
});
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${auth.session.access_token}`,
  'X-Account-Id': auth.activeAccount.account_id,
};

async function invoke(serviceName, serviceMethod, postData = {}) {
  const payload = await jsonRequest('service', {
    method: 'POST',
    headers,
    body: JSON.stringify({ serviceName, serviceMethod, postData }),
  });
  return payload?.data ?? payload;
}

function visitBlocks(blocks, visitor) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    visitor(block);
    visitBlocks(block.blocks, visitor);
    for (const tab of Array.isArray(block.tabs) ? block.tabs : []) visitBlocks(tab.blocks, visitor);
    visitBlocks(block.overlays, visitor);
  }
}

function visitDirectives(page, visitor) {
  for (const handler of page.schema.eventHandlers ?? []) {
    for (const directive of handler.directives ?? []) visitor(directive);
  }
  const inspectBlock = (block) => {
    const groups = [
      block.actions,
      block.schema?.actions,
      block.schema?.toolbar,
      block.schema?.rowActions?.actions,
    ];
    for (const actions of groups) {
      for (const action of Array.isArray(actions) ? actions : []) {
        for (const directive of action.directives ?? []) visitor(directive);
      }
    }
    for (const directives of Object.values(block.schema?.events ?? {})) {
      for (const directive of Array.isArray(directives) ? directives : []) visitor(directive);
    }
  };
  visitBlocks(page.schema.blocks, inspectBlock);
  visitBlocks(page.schema.overlays, inspectBlock);
  visitBlocks(page.overlays, inspectBlock);
}

const routes = await invoke('admin', 'listNavigationRoutes');
const pageCodes = [...new Set(routes.map((route) => route.page_code).filter(Boolean))];
const pages = await Promise.all(pageCodes.map((code) => invoke('lowcode', 'getRuntimePage', { code })));
const unsupportedMaterials = new Set();
const unsupportedDirectives = new Set();
const dataSourceFailures = [];
for (const page of pages) {
  visitBlocks(page.schema.blocks, (block) => {
    if (!allowedMaterials.has(block.kind)) unsupportedMaterials.add(`${page.code}:${block.kind}`);
  });
  visitBlocks(page.schema.overlays, (block) => {
    if (!allowedMaterials.has(block.kind)) unsupportedMaterials.add(`${page.code}:${block.kind}`);
  });
  visitBlocks(page.overlays, (block) => {
    if (!allowedMaterials.has(block.kind)) unsupportedMaterials.add(`${page.code}:${block.kind}`);
  });
  visitDirectives(page, (directive) => {
    if (directive?.type && !allowedDirectives.has(directive.type)) {
      unsupportedDirectives.add(`${page.code}:${directive.type}`);
    }
  });

  for (const [sourceKey, source] of Object.entries(page.schema.dataSources ?? {})) {
    if (source.autoLoad === false) continue;
    const request = normalizeDataSourceRequest({ ...source, key: source.key ?? sourceKey });
    try {
      await invoke(request.serviceName, request.serviceMethod, request.postData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const tolerated = unavailableEmptyListMethods.has(request.originalServiceMethod)
        && (message.includes('does not exist') || message.includes('Could not find the table'));
      if (!tolerated) dataSourceFailures.push(`${page.code}.${sourceKey}: ${message}`);
    }
  }
}

assert.deepEqual([...unsupportedMaterials], [], 'authorized pages must only use registered mobile materials');
assert.deepEqual([...unsupportedDirectives], [], 'authorized pages must only use supported mobile directives');
assert.deepEqual(dataSourceFailures, [], 'all auto-load data sources must complete successfully');
assert.ok(pages.length > 0, 'the audit account must expose at least one runtime page');
console.log(`authorized mobile page audit passed: ${routes.length} routes, ${pages.length} pages`);
