/** Compatibility export. Node action catalog lives outside the runtime kernel. */
// getLowCodeNodeActionMethods(kind, block, actions) filters actions where action.node_type === kind and action.action_code === method, then exposes action.action_code.
export * from '../runtime-core/node-action-registry.ts';
