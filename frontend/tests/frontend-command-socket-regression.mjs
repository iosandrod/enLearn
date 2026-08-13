import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const chatSocketSource = await readFile(
  new URL('../composables/useChatSocket.ts', import.meta.url),
  'utf8',
);
const commandSocketSource = await readFile(
  new URL('../composables/useFrontendCommandSocket.ts', import.meta.url),
  'utf8',
);
const chatWidgetSource = await readFile(
  new URL('../../packages/chat-widget/src/components/ChatPopupWidget.vue', import.meta.url),
  'utf8',
);

assert.match(commandSocketSource, /const socket = await chatSocket\.connect\(\)/);
assert.match(commandSocketSource, /if \(!active\) return;/);
assert.match(commandSocketSource, /chatSocket\.release\(\)/);
assert.doesNotMatch(chatWidgetSource, /props\.socket\.disconnect/);

const harness = {
  sockets: [],
  emitted: [],
};
const auth = {
  activeAccount: { value: { account_id: 'account-1' } },
};
const states = new Map();

globalThis.__chatSocketHarness = harness;
globalThis.useAuth = () => auth;
globalThis.useState = (key, init) => {
  if (!states.has(key)) states.set(key, { value: init() });
  return states.get(key);
};
globalThis.$fetch = async () => ({
  token: 'socket-token',
  socketBaseUrl: 'http://socket.test',
});
globalThis.createError = ({ statusCode, statusMessage, message }) => {
  const error = new Error(statusMessage ?? message ?? 'Application error');
  error.statusCode = statusCode;
  return error;
};

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../composables/useChatSocket.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  define: {
    'import.meta.server': 'false',
  },
  plugins: [{
    name: 'chat-socket-harness',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^socket\.io-client$/ }, () => ({
        path: 'socket.io-client',
        namespace: 'chat-socket-harness',
      }));
      buildApi.onLoad(
        { filter: /.*/, namespace: 'chat-socket-harness' },
        () => ({
          loader: 'js',
          contents: `
            export function io(_url, options) {
              const handlers = new Map();
              const socket = {
                auth: options.auth,
                connected: true,
                connectCalls: 0,
                disconnectCalls: 0,
                on(event, handler) {
                  const listeners = handlers.get(event) ?? new Set();
                  listeners.add(handler);
                  handlers.set(event, listeners);
                  return socket;
                },
                off(event, handler) {
                  handlers.get(event)?.delete(handler);
                  return socket;
                },
                emit(event, payload) {
                  globalThis.__chatSocketHarness.emitted.push({ event, payload });
                  return socket;
                },
                connect() {
                  socket.connectCalls += 1;
                  socket.connected = true;
                  for (const handler of handlers.get('connect') ?? []) handler();
                  return socket;
                },
                disconnect() {
                  socket.disconnectCalls += 1;
                  const wasConnected = socket.connected;
                  socket.connected = false;
                  if (wasConnected) {
                    for (const handler of handlers.get('disconnect') ?? []) handler();
                  }
                  return socket;
                },
              };
              globalThis.__chatSocketHarness.sockets.push(socket);
              return socket;
            }
          `,
        }),
      );
    },
  }],
});
const chatSocketModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const { useChatSocket } = chatSocketModule;

const firstLease = useChatSocket();
const secondLease = useChatSocket();
await Promise.all([firstLease.connect(), secondLease.connect()]);
assert.equal(harness.sockets.length, 1, 'concurrent consumers should share one socket');

await firstLease.connect();
await firstLease.joinConversation('conversation-1');
await firstLease.sendMessage({ conversationId: 'conversation-1', content: 'hello' });
await firstLease.markRead('conversation-1');
await firstLease.setTyping('conversation-1', true);

const sharedSocket = harness.sockets[0];
firstLease.release();
assert.equal(
  sharedSocket.disconnectCalls,
  0,
  'repeated operations by one consumer must not retain extra socket references',
);
firstLease.release();
assert.equal(sharedSocket.disconnectCalls, 0, 'release should be idempotent per consumer');
secondLease.release();
assert.equal(sharedSocket.disconnectCalls, 1, 'the last consumer should close the socket');

const reconnectLease = useChatSocket();
const reconnectSocket = await reconnectLease.connect();
reconnectSocket.connected = false;
await reconnectLease.connect();
assert.equal(reconnectSocket.connectCalls, 1, 'a disconnected shared socket should reconnect');
reconnectLease.release();
assert.equal(
  reconnectSocket.disconnectCalls,
  1,
  'reconnecting one consumer must not retain a second lease',
);

const staleLease = useChatSocket();
await staleLease.connect();
const previousAccountSocket = harness.sockets.at(-1);
auth.activeAccount.value = { account_id: 'account-2' };
const currentLease = useChatSocket();
await currentLease.connect();
const currentAccountSocket = harness.sockets.at(-1);

assert.notEqual(currentAccountSocket, previousAccountSocket);
assert.equal(previousAccountSocket.disconnectCalls, 1, 'account changes should replace the socket');
staleLease.release();
assert.equal(
  currentAccountSocket.disconnectCalls,
  0,
  'a stale consumer must not release a newer account connection',
);
currentLease.disconnect();
assert.equal(currentAccountSocket.disconnectCalls, 1, 'disconnect should release the local lease');

console.log('frontend command shared socket tests passed');
