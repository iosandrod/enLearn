import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';

export const signInSchema: LowCodeFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'email',
      label: 'Account',
      component: 'vxe-input',
      props: {
        placeholder: 'admin',
        clearable: true
      },
      rules: [{ required: true, message: 'Account is required' }]
    },
    {
      field: 'password',
      label: 'Password',
      component: 'vxe-password-input',
      props: {
        placeholder: 'Password',
        clearable: true
      },
      rules: [
        { required: true, message: 'Password is required' },
        { min: 6, message: 'Password must be at least 6 characters' }
      ]
    }
  ],
  actions: []
};

export const signUpSchema: LowCodeFormSchema = {
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
    },
    {
      field: 'password',
      label: 'Password',
      component: 'vxe-password-input',
      props: {
        placeholder: 'Password',
        clearable: true
      },
      rules: [
        { required: true, message: 'Password is required' },
        { min: 6, message: 'Password must be at least 6 characters' }
      ]
    }
  ],
  actions: [
    {
      code: 'submit',
      label: 'Create account',
      type: 'submit',
      status: 'primary'
    }
  ]
};
