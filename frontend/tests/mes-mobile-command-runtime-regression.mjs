import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [renderer, queue, serviceRequest, actionGroup, mobileList, mobileModal, virtualTable] = await Promise.all([
  readFile(new URL('../../mobile-app/src/runtime/mobile-page-renderer.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/offline-queue.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/service-request.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/materials/mobile-action-group.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/materials/mobile-list.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/materials/mobile-modal.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../mobile-app/src/runtime/materials/mobile-virtual-table.vue', import.meta.url), 'utf8'),
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
for (const source of [actionGroup, mobileList, mobileModal, virtualTable]) {
  assert.match(
    source,
    /is-executing/,
    'Every mobile MES action surface must expose its executing state to users and E2E waits.',
  );
  assert.match(
    source,
    /aria-busy/,
    'Every mobile MES action surface must expose its executing state to assistive technology.',
  );
  assert.match(
    source,
    /opacity:[\s\S]*?0\.55[\s\S]*?1/,
    'Every mobile MES action surface must render an observable executing state.',
  );
}
assert.match(
  renderer,
  /const actions = Array\.isArray\(rawConfig\.actions\)[\s\S]*?actionLabel\('confirm', '确定'\)/,
  'Mobile global dialogs must honor configured confirm and cancel action labels.',
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
  renderer,
  /const executingActions = reactive\(new Set<string>\(\)\)[\s\S]*?executingActions\.size > 0[\s\S]*?当前操作仍在处理中，请稍候。[\s\S]*?executingActions\.delete\(actionKey\)/,
  'Mobile action dispatch must suppress duplicate taps until the directive chain settles.',
);
assert.match(
  renderer,
  /if \(options\.ordered\)[\s\S]*?for \(const entry of entries\) await loadEntry\(entry\)[\s\S]*?else \{[\s\S]*?Promise\.all\(entries\.map\(loadEntry\)\)/,
  'MES command refreshes must be ordered without serializing unrelated page loads.',
);
assert.match(
  renderer,
  /const followsMesCommand = executionContext\.mesCommandState === 'completed'[\s\S]*?ordered: followsMesCommand[\s\S]*?strict: followsMesCommand[\s\S]*?mesCommandState = 'refreshed'/,
  'A successful MES command must hold its action lock through a strict ordered refresh.',
);
assert.match(
  renderer,
  /executionContext\.mesCommandState === 'queued'[\s\S]*?\['refreshDataSource', 'refreshDataSources', 'showMessage'\][\s\S]*?executionContext\.mesCommandState = 'queued'/,
  'Queued offline MES commands must not claim that server-side refresh or completion succeeded.',
);
assert.match(
  renderer,
  /MES_EXECUTION_REFRESH_SOURCE_KEYS[\s\S]*?flushOfflineQueue[\s\S]*?mesRefreshKeys[\s\S]*?ordered: true, strict: true/,
  'Replayed MES commands must refresh the five execution projections strictly and in order.',
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
