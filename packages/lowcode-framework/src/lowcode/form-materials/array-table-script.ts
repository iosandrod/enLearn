import type { LowCodeRuntimeBlockEditor } from '../../runtime/block-editor';
import type { LowCodeRuntimeEvent } from '../../types/lowcode';
import { executeLowCodeScript } from '../../runtime/scripts';
import { showVxeMessage, type VxeMessageStatus } from '../../utils/vxe-message';

/** Standalone forms use the same isolation, with only message capabilities. */
export async function executeArrayTableScript(
  script: string,
  event: LowCodeRuntimeEvent,
  runtime?: LowCodeRuntimeBlockEditor | null,
) {
  if (runtime?.executeButtonScript) return runtime.executeButtonScript(script, event);

  const capabilities = ['message.info', 'message.success', 'message.warning', 'message.error'] as const;
  const result = await executeLowCodeScript({
    script,
    context: {
      page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {},
      event: { ...event.payload, name: event.name, blockId: event.blockId },
      policy: { apiNames: [], capabilities: [...capabilities] },
    },
  }, (request) => {
    if (!capabilities.includes(request.name as typeof capabilities[number])) {
      throw new Error(`独立表单不支持脚本能力 ${request.name}，请在低代码页面中执行。`);
    }
    showVxeMessage(String(request.args[0] ?? ''), request.name.slice('message.'.length) as VxeMessageStatus);
  });
  return result.value;
}
