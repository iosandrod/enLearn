import type { LowCodeFormSchema } from '~/types/lowcode';

export const settingsSchema: LowCodeFormSchema = {
  columns: 2,
  fields: [
    {
      field: 'notifyEverything',
      label: 'Everything',
      component: 'vxe-switch',
      help: 'Email digest, mentions and all activity.'
    },
    {
      field: 'notifyAvailable',
      label: 'Available',
      component: 'vxe-switch',
      help: 'Only mentions and comments.'
    },
    {
      field: 'notifyIgnoring',
      label: 'Ignoring',
      component: 'vxe-switch',
      help: 'Turn off all notifications.'
    },
    {
      field: 'language',
      label: 'Language',
      component: 'vxe-select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Spanish', value: 'es' }
      ]
    },
    {
      field: 'theme',
      label: 'Theme',
      component: 'vxe-select',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Dark', value: 'dark' },
        { label: 'System', value: 'system' }
      ]
    },
    {
      field: 'font',
      label: 'Font',
      component: 'vxe-select',
      options: [
        { label: 'Sans Serif', value: 'sans' },
        { label: 'Serif', value: 'serif' },
        { label: 'Monospace', value: 'mono' }
      ]
    }
  ],
  actions: [
    {
      code: 'submit',
      label: 'Save Settings',
      type: 'submit',
      status: 'primary'
    }
  ]
};
