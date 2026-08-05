import type { LowCodePageType } from '@enlearn/lowcode-framework/types/lowcode';

export type DashboardTabCloseScope = 'current' | 'left' | 'right' | 'others';

export function formatDashboardTabTitle(title: string, pageType?: LowCodePageType) {
  return pageType === 'edit' && !title.endsWith('编辑') ? `${title}编辑` : title;
}

export function closeDashboardTabs<T extends { path: string }>(
  tabs: readonly T[],
  targetPath: string,
  scope: DashboardTabCloseScope,
) {
  const targetIndex = tabs.findIndex((tab) => tab.path === targetPath);
  if (targetIndex < 0) return [...tabs];

  if (scope === 'current') return tabs.filter((_, index) => index !== targetIndex);
  if (scope === 'left') return tabs.slice(targetIndex);
  if (scope === 'right') return tabs.slice(0, targetIndex + 1);
  return [tabs[targetIndex]!];
}
