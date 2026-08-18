import type { LowCodeNodeTypeDefinition } from './index';

/**
 * Button-group items invoke page functions, scripts, or directives. The node
 * itself does not currently expose a script-callable executeAction method.
 */
export const buttonGroupNodeActionDefinition = {
  kind: 'buttonGroup',
  label: '按钮组',
  icon: 'ri-layout-grid-line',
  methods: {},
} satisfies LowCodeNodeTypeDefinition;
