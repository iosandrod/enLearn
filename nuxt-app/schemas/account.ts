import type { LowCodeFormSchema, LowCodeGridSchema } from '~/types/lowcode';

export const profileSchema: LowCodeFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'fullName',
      label: 'Full Name',
      component: 'vxe-input',
      props: {
        placeholder: 'Enter your full name',
        clearable: true
      }
    }
  ],
  actions: [
    {
      code: 'submit',
      label: 'Update Name',
      type: 'submit',
      status: 'primary'
    }
  ]
};

export const emailSchema: LowCodeFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'email',
      label: 'Email',
      component: 'vxe-input',
      props: {
        placeholder: 'name@example.com',
        type: 'email',
        clearable: true
      },
      rules: [{ required: true, message: 'Email is required' }]
    }
  ],
  actions: [
    {
      code: 'submit',
      label: 'Update Email',
      type: 'submit',
      status: 'primary'
    }
  ]
};

export const subscriptionGridSchema: LowCodeGridSchema = {
  title: 'Subscription',
  grid: {
    border: true,
    showOverflow: true,
    columns: [
      { field: 'label', title: 'Field', width: 180 },
      { field: 'value', title: 'Value', minWidth: 220 }
    ]
  }
};
