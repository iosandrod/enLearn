import { VxeUI } from 'vxe-pc-ui';
import {
  createFrontendCommandRuntime,
  FRONTEND_COMMAND_ACK_EVENT,
  FRONTEND_COMMAND_EVENT,
  type FrontendCommandAck
} from '../utils/frontendCommandRuntime';
import type { Socket } from 'socket.io-client';

export function useFrontendCommandSocket() {
  const auth = useAuth();
  const chatSocket = useChatSocket();
  const lastAck = useState<FrontendCommandAck | null>('frontend-command-last-ack', () => null);
  const listenerReady = useState<boolean>('frontend-command-listener-ready', () => false);
  let boundSocket = chatSocket.getSocket();
  let boundHandler: ((payload: unknown) => Promise<void>) | null = null;
  let bindGeneration = 0;

  const runtime = createFrontendCommandRuntime({
    accountId: () => auth.activeAccount.value?.account_id ?? '',
    showMessage: ({ message, type, duration }) => {
      const modal = VxeUI.modal;
      if (!modal?.message) throw new Error('Message presenter is unavailable.');
      return modal.message({ content: message, status: type, duration });
    }
  });

  async function connect() {
    if (import.meta.server) return null;
    const generation = ++bindGeneration;
    const socket = await chatSocket.connect();
    if (generation !== bindGeneration || !socket) return socket;
    bindSocket(socket);
    return socket;
  }

  function disconnect() {
    bindGeneration += 1;
    if (boundSocket && boundHandler) {
      boundSocket.off(FRONTEND_COMMAND_EVENT, boundHandler);
    }
    boundSocket = null;
    boundHandler = null;
    listenerReady.value = false;
    runtime.clear();
    chatSocket.release();
  }

  function bindSocket(socket: Socket) {
    const previousSocket = boundSocket;
    const previousHandler = boundHandler;

    const handler = async (payload: unknown) => {
      const ack = await runtime.execute(payload);
      lastAck.value = ack;
      socket.emit(FRONTEND_COMMAND_ACK_EVENT, ack);
    };

    if (previousSocket === socket && previousHandler) {
      socket.off(FRONTEND_COMMAND_EVENT, previousHandler);
    }
    socket.off(FRONTEND_COMMAND_EVENT, handler);
    socket.on(FRONTEND_COMMAND_EVENT, handler);
    boundSocket = socket;
    boundHandler = handler;
    listenerReady.value = true;

    if (previousSocket && previousSocket !== socket && previousHandler) {
      previousSocket.off(FRONTEND_COMMAND_EVENT, previousHandler);
    }
  }

  return {
    status: chatSocket.status,
    lastError: chatSocket.lastError,
    lastAck,
    listenerReady,
    connect,
    disconnect
  };
}
