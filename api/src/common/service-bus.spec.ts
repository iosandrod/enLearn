import assert from 'node:assert/strict';

import {
  DOMAIN_SERVICE_NAMES,
  getServiceExecutePattern,
  isDomainServiceName,
  isPublicServiceName,
  parseIndependentServiceNames,
  resolveServiceExecutePattern,
  SERVICE_EXECUTE_PATTERN
} from './service-bus';

assert.equal(isDomainServiceName('account'), true);
assert.equal(isDomainServiceName('workflow'), false);
assert.equal(isDomainServiceName('planning'), true);
assert.equal(isPublicServiceName('workflow'), true);
assert.equal(isPublicServiceName('unknown'), false);

assert.equal(getServiceExecutePattern('account'), 'service.account.execute');
assert.equal(getServiceExecutePattern('entityDesign'), 'service.entityDesign.execute');
assert.equal(getServiceExecutePattern('planning'), 'service.planning.execute');

const selectedServices = parseIndependentServiceNames('account, posts,files');
assert.deepEqual([...selectedServices], ['account', 'posts', 'files']);
assert.equal(
  resolveServiceExecutePattern('account', selectedServices),
  'service.account.execute'
);
assert.equal(
  resolveServiceExecutePattern('admin', selectedServices),
  SERVICE_EXECUTE_PATTERN
);

const allServices = parseIndependentServiceNames('all');
assert.deepEqual([...allServices], [...DOMAIN_SERVICE_NAMES]);
assert.equal(resolveServiceExecutePattern('chat', allServices), 'service.chat.execute');

assert.throws(
  () => parseIndependentServiceNames('account,missing'),
  /Unsupported independent service name: missing/
);
