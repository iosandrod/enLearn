import type { LowCodePageType } from '@enlearn/lowcode-framework/types/lowcode';

export function formatDashboardTabTitle(title: string, pageType?: LowCodePageType) {
  return pageType === 'edit' && !title.endsWith('编辑') ? `${title}编辑` : title;
}
