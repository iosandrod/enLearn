export type LowCodeMaterialRuntimeController = {
  loadData?: (options?: Record<string, unknown>) => unknown | Promise<unknown>;
  setData?: (value: unknown, options?: Record<string, unknown>) => unknown | Promise<unknown>;
  getData?: () => unknown | Promise<unknown>;
  validate?: () => unknown | Promise<unknown>;
};

const controllers = new Map<string, LowCodeMaterialRuntimeController>();

export function registerLowCodeMaterialRuntimeController(
  blockId: string,
  controller: LowCodeMaterialRuntimeController,
) {
  const id = String(blockId || '').trim();
  if (!id) return () => undefined;
  controllers.set(id, controller);
  return () => {
    if (controllers.get(id) === controller) controllers.delete(id);
  };
}

export function getLowCodeMaterialRuntimeController(blockId: string) {
  return controllers.get(String(blockId || '').trim());
}

export async function executeLowCodeMaterialRuntimeAction(
  blockId: string,
  method: keyof LowCodeMaterialRuntimeController,
  ...args: unknown[]
) {
  const controller = getLowCodeMaterialRuntimeController(blockId);
  const handler = controller?.[method];
  if (typeof handler !== 'function') {
    throw new Error(`节点 "${blockId}" 未挂载动作 "${method}"。`);
  }
  return await handler(...args as [never]);
}
