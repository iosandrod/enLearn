import type { LowCodePageRecord } from '../../types/lowcode';
import { userRoleManagementPage } from './user-role-management';
import { permissionSystemPages } from './permission-system';

export const builtinLowCodePages: LowCodePageRecord[] = [
  userRoleManagementPage,
  ...permissionSystemPages,
];

function normalizeRoutePath(route: string) {
  const normalized = route.trim().replace(/\/+$/, '');
  return normalized || '/';
}

export function getBuiltinLowCodePageByCode(code: string) {
  const normalizedCode = code.trim();
  return builtinLowCodePages.find((page) => page.code === normalizedCode) ?? null;
}

export function getBuiltinLowCodePageByRoute(route: string) {
  const normalizedRoute = normalizeRoutePath(route);
  return (
    builtinLowCodePages.find(
      (page) => normalizeRoutePath(page.route) === normalizedRoute
    ) ?? null
  );
}
