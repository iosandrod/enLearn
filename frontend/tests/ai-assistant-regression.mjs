import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const streamSource = await readFile(resolve(root, 'composables/useAiStream.ts'), 'utf8');
const contextSource = await readFile(resolve(root, 'composables/useAiPageContext.ts'), 'utf8');
const drawerSource = await readFile(resolve(root, 'components/ai/AiAssistantDrawer.vue'), 'utf8');
const approvalSource = await readFile(resolve(root, 'components/ai/AiApprovalDialog.vue'), 'utf8');
const dashboardSource = await readFile(resolve(root, 'layouts/dashboard.vue'), 'utf8');
const compatSource = await readFile(resolve(root, 'src/spa-compat.ts'), 'utf8');
const assistantSource = await readFile(resolve(root, 'composables/useAiAssistant.ts'), 'utf8');
const runtimePageSource = await readFile(resolve(root, 'pages/dashboard/[...slug].vue'), 'utf8');

assert.match(streamSource, /response\.body\.getReader\(\)/, 'SSE must be consumed incrementally');
assert.match(streamSource, /Last-Event-ID/, 'SSE recovery must retain the event sequence');
assert.match(streamSource, /ended before the run completed/, 'premature SSE EOF must trigger recovery');
assert.match(assistantSource, /stream\.resume\(targetRunId, lastEventSequence\.value/, 'interrupted streams must attempt one authenticated recovery');
assert.match(assistantSource, /event\.sequence <= lastEventSequence\.value/, 'replayed SSE events must be deduplicated');
assert.match(assistantSource, /wasRunning && targetRunId/, 'new-conversation cleanup must not cancel a completed run');
assert.match(assistantSource, /else \{\s*await stream\.start\(input/s, 'pre-header failures must retry with the same request id');
assert.match(assistantSource, /resetForIdentityChange/, 'AI state must support account and user isolation resets');
assert.match(assistantSource, /if \(!target\.content\) target\.content = message/, 'provider errors must be shown in the failed assistant message');
assert.match(assistantSource, /event\.payload\.status === 'failed'/, 'failed runs must not be rendered as successfully completed');
assert.match(compatSource, /authenticatedFetchResponse/, 'raw authenticated fetch must share auth refresh');
assert.match(contextSource, /SENSITIVE_KEY/, 'client context must redact sensitive keys');
assert.match(contextSource, /slice\(0, 20\)/, 'sample arrays must be bounded');
assert.match(contextSource, /function sanitizeSample[\s\S]*?\[redacted\]/, 'sample string values must be redacted before leaving the browser');
assert.match(drawerSource, /width: min\(480px/, 'desktop drawer must remain a restrained right rail');
assert.match(drawerSource, /width: 100vw/, 'mobile drawer must become full screen');
assert.match(approvalSource, /这是全局页面变更/, 'approval must warn about global page semantics');
assert.match(approvalSource, /我已审阅差异/, 'approval must require explicit acknowledgement');
assert.match(dashboardSource, /<ChatPopup\s*\/>\s*<AiAssistantButton\s*\/>\s*<NotificationBell\s*\/>/, 'AI entry must stay independent from chat and notifications');
assert.match(dashboardSource, /aiAssistant\.resetForIdentityChange\(\)/, 'account switches must clear AI state');
assert.match(dashboardSource, /await aiAssistant\.cancel\(\);\s*await auth\.selectAccount/s, 'account switches must cancel the server run before identity changes');
assert.match(dashboardSource, /await aiAssistant\.cancel\(\);\s*await auth\.signOut/s, 'sign-out must cancel the server run first');
assert.match(runtimePageSource, /enlearn:ai-page-applied/, 'applied proposals must refresh the current runtime page');

console.log('AI assistant frontend regression tests passed');
