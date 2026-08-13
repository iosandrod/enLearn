import { VxeUI } from 'vxe-pc-ui';
import {
  createFrontendCommandRuntime,
  FRONTEND_COMMAND_ACK_EVENT,
  FRONTEND_COMMAND_EVENT,
  type FrontendCommandAck
} from '../utils/frontendCommandRuntime';

export function useFrontendCommandSocket() {
  const auth = useAuth();
  const chatSocket = useChatSocket();
  const lastAck = useState<FrontendCommandAck | null>('frontend-command-last-ack', () => null);
  let active = false;
  let boundSocket = chatSocket.getSocket();

  const runtime = createFrontendCommandRuntime({
    accountId: () => auth.activeAccount.value?.account_id ?? '',
    showMessage: ({ message, type, duration }) => {
      const modal = VxeUI.modal;
      if (!modal?.message) throw new Error('Message presenter is unavailable.');
      return modal.message({ content: message, status: type, duration });
    }
  });

  const handleCommand = async (payload: unknown) => {
    const ack = await runtime.execute(payload);
    lastAck.value = ack;
    boundSocket?.emit(FRONTEND_COMMAND_ACK_EVENT, ack);
  };

  async function connect() {
    if (active || import.meta.server) return;
    active = true;
    try {
      const socket = await chatSocket.connect();
      if (!active) return;
      boundSocket = socket;
      socket?.on(FRONTEND_COMMAND_EVENT, handleCommand);
    } catch (error) {
      active = false;
      throw error;
    }
  }

  function disconnect() {
    if (!active) return;
    boundSocket?.off(FRONTEND_COMMAND_EVENT, handleCommand);
    boundSocket = null;
    active = false;
    runtime.clear();
    chatSocket.release();
  }

  return {
    status: chatSocket.status,
    lastError: chatSocket.lastError,
    lastAck,
    connect,
    disconnect
  };
}
