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

const validator = new PageProposalValidator();
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
