import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [renderer, queue, serviceRequest] = await Promise.all([
  readFile(new URL('../../mobile-app/src/runtime/mobile-page-renderer.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/offline-queue.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/service-request.ts', import.meta.url), 'utf8'),
]);

assert.match(
  serviceRequest,
  /export function isMobileMesCommand[\s\S]*?serviceName\.trim\(\) === 'mes'/,
  'Only explicit MES command methods may enter the MES offline command path.',
);
assert.match(
  renderer,
  /case 'invokeService':[\s\S]*?isMobileMesCommand\(directive\.serviceName, directive\.serviceMethod\)/,
  'Mobile low-code invokeService directives must detect MES commands.',
);
assert.match(
  renderer,
  /enrichMobileMesCommandRequest[\s\S]*?mobileNetwork\.status === 'offline'[\s\S]*?enqueueOfflineRequest/,
  'Offline MES commands must be enriched and durably queued before returning.',
);
assert.match(
  renderer,
  /props\.serviceApi\.replay\(request\)[\s\S]*?isTransientMobileWriteError[\s\S]*?enqueueOfflineRequest/,
  'Transient online command failures must preserve the same request in the offline queue.',
);
assert.match(
  renderer,
  /type: 'confirmGlobalDialog'[\s\S]*?directives: normalizeDirectiveList\(directive\.confirmDirectives\)/,
  'Mobile global dialogs must use an atomic confirmation directive.',
);
assert.match(
  renderer,
  /case 'confirmGlobalDialog':[\s\S]*?validateMobileFormValues[\s\S]*?await executeDirective\(followUp[\s\S]*?setBlockOpen\(blockId, false\)/,
  'Mobile dialogs must validate and finish every command before closing.',
);
assert.match(
  queue,
  /commandId: request\.requestId[\s\S]*?deviceId: resolvedDeviceId[\s\S]*?localSequence: resolvedLocalSequence/,
  'Queued MES commands must carry stable command, device, and sequence identifiers.',
);
assert.match(
  queue,
  /const sequenceReservations = new Map[\s\S]*?sequenceReservations\.set\(key, reservation\)/,
  'Parallel mobile commands must serialize local sequence reservations.',
);

console.log('MES mobile command runtime regression test passed.');
