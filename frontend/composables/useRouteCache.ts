import { reactive, readonly, shallowRef } from 'vue';

export type RouteCacheInvalidation = {
  id: number;
  path: string;
  previousVersion: number;
};

const routeCacheVersions = reactive(new Map<string, number>());
const invalidation = shallowRef<RouteCacheInvalidation | null>(null);
let invalidationId = 0;

export function useRouteCache() {
  function getVersion(path: string) {
    return routeCacheVersions.get(path) ?? 0;
  }

  function invalidate(path: string) {
    const previousVersion = getVersion(path);
    routeCacheVersions.set(path, previousVersion + 1);
    invalidation.value = {
      id: ++invalidationId,
      path,
      previousVersion,
    };
  }

  return {
    invalidation: readonly(invalidation),
    getVersion,
    invalidate,
  };
}
