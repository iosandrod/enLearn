import assert from 'node:assert/strict';
import { PageProposalValidator } from './page-proposal.validator';
import { pageProposalInternals } from './page-proposal.service';

const base = {
  schemaVersion: 1,
  code: 'orders',
  route: '/dashboard/orders',
  title: 'Orders',
  pageType: 'list',
  layout: 'dashboard',
  status: 'draft',
  keepAlive: true,
  dataSources: {},
  blocks: [{ id: 'actions', kind: 'buttonGroup', actions: [] }],
  visualEditor: {
    pages: {
      '/': {
        title: 'Orders',
        path: '/',
        blocks: [{ componentKey: 'lowcode-button-group', props: { blockId: 'actions', buttons: [] } }]
      }
    }
  }
};
const operation = {
  type: 'upsertButtonAction' as const,
  blockId: 'actions',
  action: {
    code: 'refresh',
    label: '刷新',
    script: pageProposalInternals.builtinScript('refresh')
  }
};
const candidate = pageProposalInternals.applyOperations(base, [operation]);
const synced = pageProposalInternals.syncVisualEditor(base, candidate, [operation]);
const runtimeAction = (synced.blocks as Array<Record<string, unknown>>)[0].actions as Array<Record<string, unknown>>;
assert.equal(runtimeAction[0].code, 'refresh');
const visualPages = (synced.visualEditor as Record<string, any>).pages;
assert.equal(visualPages['/'].blocks[0].props.buttons[0].code, 'refresh');
assert.equal(
  pageProposalInternals.resolveButtonGroupId(base),
  'actions',
  'button proposals must record their resolved target group explicitly'
);
const validator = new PageProposalValidator();
const salesOrderSchema = {
  ...base,
  code: 'sales-orders',
  route: '/dashboard/sales/orders',
  title: '销售订单',
  dataSources: {
    salesOrders: {
      key: 'salesOrders',
      serviceName: 'admin',
      serviceMethod: 'listItems',
      tableName: 'sales_orders'
    }
  },
  blocks: [
    { id: 'sales-order-actions', kind: 'buttonGroup', actions: [] },
    {
      id: 'sales-order-grid',
      kind: 'grid',
      sourceKey: 'salesOrders',
      schema: { grid: { columns: [{ field: 'id', title: 'ID' }] } }
    }
  ]
};
const salesOrderButtonOperation = {
  type: 'upsertButtonAction' as const,
  blockId: pageProposalInternals.resolveButtonGroupId(salesOrderSchema),
  action: {
    code: 'custom-record-edit',
    label: '测试',
    type: 'button',
    prefixIcon: 'ri-edit-line',
    eventName: 'buttonGroup.custom-record-edit',
    script: pageProposalInternals.builtinScript('edit')
  }
};
const salesOrderCandidate = pageProposalInternals.applyOperations(
  salesOrderSchema,
  [salesOrderButtonOperation]
);
const salesOrderGroup = (salesOrderCandidate.blocks as Array<Record<string, unknown>>)[0];
const salesOrderAction = (salesOrderGroup.actions as Array<Record<string, unknown>>)[0];
assert.equal(salesOrderButtonOperation.blockId, 'sales-order-actions');
assert.equal(salesOrderAction.label, '测试');
assert.match(String(salesOrderAction.script), /name: "edit"/);
assert.equal(
  validator.validate(salesOrderCandidate, 1, [], salesOrderSchema).issues.some(
    (issue) => issue.level === 'error'
  ),
  false,
  'the sales-order edit button candidate must pass deterministic validation'
);

const salesOrderAiSchema = {
  ...base,
  code: 'sales-orders',
  route: '/dashboard/sales/orders',
  title: '销售订单',
  dataSources: {
    salesOrders: { key: 'salesOrders', tableName: 'sales_orders' },
    salesOrderLines: { key: 'salesOrderLines', tableName: 'sales_order_lines' }
  },
  blocks: [
    {
      id: 'sales-order-actions',
      kind: 'buttonGroup',
      actions: [{
        code: 'refresh',
        label: '刷新',
        directives: [{ type: 'refreshDataSource', sourceKeys: ['salesOrders'] }]
      }]
    },
    {
      id: 'sales-order-grid',
      kind: 'grid',
      sourceKey: 'salesOrders',
      schema: {
        grid: {
          columns: [
            { field: 'doc_no', title: '订单号', minWidth: 160 },
            { field: 'customer_code', title: '客户编码', minWidth: 140 }
          ]
        }
      }
    },
    {
      id: 'sales-order-lines-tabs',
      kind: 'tabs',
      tabs: [{
        key: 'lines',
        label: '订单明细',
        blocks: [{
          id: 'sales-order-lines-grid',
          kind: 'grid',
          sourceKey: 'salesOrderLines',
          schema: {
            grid: {
              columns: [
                { field: 'item_code', title: '物料编码', minWidth: 140 },
                { field: 'item_spec', title: '规格', minWidth: 140 },
                { field: 'uom_name', title: '单位', width: 82 },
                { field: 'remark', title: '备注', minWidth: 180 }
              ]
            }
          }
        }]
      }]
    }
  ]
};
const salesOrderAiOperations = validator.parseOperations([
  {
    type: 'updateGridColumn',
    blockId: 'sales-order-grid',
    field: 'customer_code',
    changes: { title: '客户编号', width: 160 }
  },
  {
    type: 'upsertGridColumn',
    blockId: 'sales-order-lines-grid',
    column: { field: 'remark', title: '备注' },
    afterField: 'item_spec'
  },
  {
    type: 'upsertPageFunction',
    name: 'refreshOrderData',
    label: '刷新订单数据',
    description: '刷新销售订单列表数据。',
    builtinFunction: 'refresh'
  },
  {
    type: 'bindButtonToPageFunction',
    blockId: 'sales-order-actions',
    actionCode: 'refresh',
    functionName: 'refreshOrderData'
  }
]);
const salesOrderAiCandidate = pageProposalInternals.applyOperations(
  salesOrderAiSchema,
  salesOrderAiOperations
);
const salesOrderAiMainGrid = (salesOrderAiCandidate.blocks as Array<Record<string, any>>)[1];
const salesOrderAiCustomerCode = salesOrderAiMainGrid.schema.grid.columns.find(
  (column: Record<string, unknown>) => column.field === 'customer_code'
);
assert.deepEqual(
  salesOrderAiCustomerCode,
  { field: 'customer_code', title: '客户编号', width: 160 },
  'AI must rename and resize only the target grid column'
);
const salesOrderAiTabs = (salesOrderAiCandidate.blocks as Array<Record<string, any>>)[2];
const salesOrderAiLineColumns = salesOrderAiTabs.tabs[0].blocks[0].schema.grid.columns;
assert.deepEqual(
  salesOrderAiLineColumns.map((column: Record<string, unknown>) => column.field),
  ['item_code', 'item_spec', 'remark', 'uom_name'],
  'AI must move the existing remark field immediately after item_spec without duplication'
);
const salesOrderAiFunctions = salesOrderAiCandidate.functions as Array<Record<string, unknown>>;
const refreshOrderData = salesOrderAiFunctions.find((pageFunction) => pageFunction.name === 'refreshOrderData');
assert.match(
  String(refreshOrderData?.script),
  /name: "refresh"/,
  'AI-created page function must use the approved refresh capability'
);
const salesOrderAiRefreshAction = (salesOrderAiCandidate.blocks as Array<Record<string, any>>)[0].actions[0];
assert.match(
  String(salesOrderAiRefreshAction.script),
  /name: "refreshOrderData"/,
  'refresh button must invoke the page function'
);
assert.equal(
  'directives' in salesOrderAiRefreshAction,
  false,
  'legacy refresh directives must be removed so the action does not refresh twice'
);
assert.equal(
  validator.validate(
    salesOrderAiCandidate,
    salesOrderAiOperations.length,
    [],
    salesOrderAiSchema
  ).issues.some((issue) => issue.level === 'error'),
  false,
  'the sales-order AI candidate must pass deterministic validation'
);
assert.deepEqual(
  pageProposalInternals.applyOperations(salesOrderAiCandidate, salesOrderAiOperations),
  salesOrderAiCandidate,
  'reapplying the sales-order request must not duplicate the remark field or refresh binding'
);
assert.equal(
  pageProposalInternals.buildDiff(salesOrderAiOperations).some(
    (item) => item.label === '按钮绑定：refresh -> refreshOrderData'
  ),
  true,
  'the proposed button binding must be visible in the review diff'
);
assert.throws(
  () => validator.parseOperations([{
    type: 'upsertGridColumn',
    blockId: 'sales-order-grid',
    column: { field: 'remark', title: '备注', slots: {} }
  }]),
  /unsupported fields/
);

const validResult = validator.validate(synced, 1, []);
assert.equal(validResult.issues.some((issue) => issue.level === 'error'), false);

const unsafe = structuredClone(synced);
const unsafeFunctions = Array.isArray(unsafe.functions) ? unsafe.functions : [];
unsafeFunctions.push({
  name: 'unsafe',
  script: 'async function main() { return fetch("https://example.com"); }'
});
unsafe.functions = unsafeFunctions;
const unsafeResult = validator.validate(unsafe, 1, []);
assert.equal(unsafeResult.issues.some((issue) => issue.message.includes('network access')), true);

const legacyUnsafeBase: Record<string, any> = structuredClone(base);
legacyUnsafeBase.scriptPolicy = { capabilities: ['http.execute'] };
legacyUnsafeBase.functions = [{
  name: 'legacySave',
  script: 'async function main() { return this.executeHttp({ api: "save", body: {} }); }'
}];
const safeMetadataEdit: Record<string, any> = structuredClone(legacyUnsafeBase);
safeMetadataEdit.description = 'Metadata-only AI change';
const grandfatheredResult = validator.validate(
  safeMetadataEdit,
  1,
  ['http.execute'],
  legacyUnsafeBase
);
assert.equal(
  grandfatheredResult.issues.some((issue) => issue.level === 'error'),
  false,
  'unchanged legacy script capabilities must not block a safe metadata-only proposal'
);

const newUnsafeScript: Record<string, any> = structuredClone(legacyUnsafeBase);
newUnsafeScript.functions.push({
  name: 'newUnsafe',
  script: 'async function main() { return this.executeHttp({ api: "save", body: {} }); }'
});
const newUnsafeResult = validator.validate(
  newUnsafeScript,
  1,
  ['http.execute'],
  legacyUnsafeBase
);
assert.equal(
  newUnsafeResult.issues.some((issue) => issue.level === 'error' && issue.path === 'functions.1.script'),
  true,
  'new unsafe scripts must still be rejected when a page already has legacy capabilities'
);

const capabilityExpansion = structuredClone(synced);
capabilityExpansion.scriptPolicy = { capabilities: ['router.push'] };
const expansionResult = validator.validate(capabilityExpansion, 1, []);
assert.equal(
  expansionResult.issues.some((issue) => issue.level === 'error' && issue.message.includes('cannot add')),
  true
);

const serviceSurfaceExpansion: Record<string, any> = structuredClone(base);
serviceSurfaceExpansion.apis = {
  dangerous: {
    serviceName: 'admin',
    serviceMethod: 'saveItem',
    method: 'POST',
    postData: { resource: 'users' }
  }
};
const serviceSurfaceResult = validator.validate(serviceSurfaceExpansion, 1, [], base);
assert.equal(
  serviceSurfaceResult.issues.some((issue) =>
    issue.level === 'error' && issue.path === 'apis.dangerous'),
  true,
  'AI edits must not add a page API that can invoke arbitrary services'
);

const directiveExpansion: Record<string, any> = structuredClone(base);
directiveExpansion.eventHandlers = [{
  event: 'page.ready',
  directives: [{
    type: 'invokeService',
    serviceName: 'admin',
    serviceMethod: 'saveItem',
    postData: { resource: 'users' }
  }]
}];
const directiveExpansionResult = validator.validate(directiveExpansion, 1, [], base);
assert.equal(
  directiveExpansionResult.issues.some((issue) =>
    issue.level === 'error' && issue.message.includes('direct service invocation')),
  true,
  'AI edits must not add an invokeService directive'
);

const safeDirectiveExpansion: Record<string, any> = structuredClone(base);
safeDirectiveExpansion.eventHandlers = [{
  event: 'page.ready',
  directives: [{ type: 'showMessage', status: 'info', message: 'Ready' }]
}];
const safeDirectiveResult = validator.validate(safeDirectiveExpansion, 1, [], base);
assert.equal(
  safeDirectiveResult.issues.some((issue) => issue.level === 'error'),
  false,
  'non-service UI directives may be proposed'
);

const legacyServiceBase: Record<string, any> = structuredClone(base);
legacyServiceBase.apis = structuredClone(serviceSurfaceExpansion.apis);
const legacyMetadataEdit = structuredClone(legacyServiceBase);
legacyMetadataEdit.description = 'Safe metadata update';
const legacyServiceResult = validator.validate(legacyMetadataEdit, 1, [], legacyServiceBase);
assert.equal(
  legacyServiceResult.issues.some((issue) => issue.level === 'error'),
  false,
  'unchanged legacy service surfaces must not block unrelated AI metadata edits'
);

const modifiedLegacyService = structuredClone(legacyServiceBase);
modifiedLegacyService.apis.dangerous.serviceMethod = 'deleteItem';
const modifiedLegacyServiceResult = validator.validate(modifiedLegacyService, 1, [], legacyServiceBase);
assert.equal(
  modifiedLegacyServiceResult.issues.some((issue) =>
    issue.level === 'error' && issue.path === 'apis.dangerous'),
  true,
  'AI edits must not modify an existing service surface'
);

assert.throws(
  () => validator.parseOperations([{ type: 'upsertButtonAction', action: {} }]),
  /not allowed/
);
assert.deepEqual(
  validator.parseOperations([{ type: 'updatePageInfo', description: 'Updated' }]),
  [{ type: 'updatePageInfo', description: 'Updated' }]
);

assert.notEqual(pageProposalInternals.schemaHash(base), pageProposalInternals.schemaHash(synced));

const nestedBase = {
  ...base,
  blocks: [{
    id: 'tabs',
    kind: 'tabs',
    tabs: [{
      key: 'details',
      blocks: [
        { id: 'first', kind: 'text', text: 'first' },
        null,
        { id: 'second', kind: 'text', text: 'second' }
      ]
    }]
  }]
};
const nestedUpdated = pageProposalInternals.applyOperations(nestedBase, [{
  type: 'removeBlock',
  blockId: 'second'
}]);
const nestedBlocks = nestedUpdated.blocks as Array<Record<string, any>>;
const nestedTabs = nestedBlocks[0].tabs;
assert.equal(nestedTabs[0].blocks.length, 2, 'nested edits must preserve raw-array indexes');
assert.equal(nestedTabs[0].blocks[0].id, 'first');
assert.equal(nestedTabs[0].blocks[1], null);

const proposalHashInput = {
  accountId: 'account-1',
  createdBy: 'user-1',
  kind: 'edit_page' as const,
  targetPageId: 'page-1',
  baseVersion: 1,
  baseSchemaHash: pageProposalInternals.schemaHash(base),
  baseSchema: base,
  operations: [{ type: 'updatePageInfo' as const, description: 'Updated' }],
  candidateSchema: synced,
  validationIssues: []
};
const proposalHash = pageProposalInternals.proposalContentHash(proposalHashInput);
assert.equal(proposalHash, pageProposalInternals.proposalContentHash(structuredClone(proposalHashInput)));
const tamperedProposal = structuredClone(proposalHashInput);
tamperedProposal.candidateSchema.title = 'Tampered';
assert.notEqual(proposalHash, pageProposalInternals.proposalContentHash(tamperedProposal));

console.log('AI page proposal tests passed');
