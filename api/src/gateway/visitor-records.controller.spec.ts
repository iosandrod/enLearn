import assert from 'node:assert/strict';

import { resolveVisitorIp } from './visitor-records.controller';

assert.equal(
  resolveVisitorIp({
    ip: '127.0.0.1',
    headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.8' }
  }),
  '203.0.113.10'
);

assert.equal(
  resolveVisitorIp({ socket: { remoteAddress: '::ffff:192.0.2.20' } }),
  '192.0.2.20'
);

assert.equal(
  resolveVisitorIp({
    ip: '::1',
    headers: { 'cf-connecting-ip': '2001:db8::10' }
  }),
  '2001:db8::10'
);

assert.equal(
  resolveVisitorIp({
    ip: '127.0.0.1',
    headers: { 'x-real-ip': 'not-an-ip' }
  }),
  '127.0.0.1'
);

console.log('Visitor record IP resolution tests passed.');
