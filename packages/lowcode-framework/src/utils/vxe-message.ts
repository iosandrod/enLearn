import { VxeUI } from 'vxe-pc-ui';
import { watch, type WatchSource } from 'vue';

export type VxeMessageStatus = 'success' | 'error' | 'warning' | 'info';

export function showVxeMessage(content: string, status: VxeMessageStatus = 'info') {
  const normalizedContent = content.trim();
  if (!normalizedContent) return;

  void VxeUI.modal.message({
    content: normalizedContent,
    status,
  });
}

export function useVxeMessage(
  source: WatchSource<string>,
  status: VxeMessageStatus | (() => VxeMessageStatus) = 'info',
) {
  return watch(
    source,
    (content) => {
      if (!content) return;
      if (typeof status === 'function') {
        queueMicrotask(() => showVxeMessage(content, status()));
        return;
      }
      showVxeMessage(content, status);
    },
    { flush: 'sync' },
  );
}
