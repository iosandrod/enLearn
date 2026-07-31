export const builtinLowCodePages = [];
function normalizeRoutePath(route) {
    const normalized = route.trim().replace(/\/+$/, '');
    return normalized || '/';
}
export function getBuiltinLowCodePageByCode(code) {
    const normalizedCode = code.trim();
    return builtinLowCodePages.find((page) => page.code === normalizedCode) ?? null;
}
export function getBuiltinLowCodePageByRoute(route) {
    const normalizedRoute = normalizeRoutePath(route);
    return (builtinLowCodePages.find((page) => normalizeRoutePath(page.route) === normalizedRoute) ?? null);
}
