import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode';

export const signInSchema: LowCodeFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'email',
      label: '登录账号',
      component: 'vxe-input',
      props: {
        placeholder: 'admin',
        clearable: true
      },
      rules: [{ required: true, message: '请输入登录账号' }]
    },
    {
      field: 'password',
      label: '登录密码',
      component: 'vxe-password-input',
      props: {
        placeholder: '请输入密码',
        clearable: true
      },
      rules: [
        { required: true, message: '请输入登录密码' },
        { min: 6, message: '密码至少需要 6 个字符' }
      ]
    },
    {
      field: 'accountId',
      label: '选择账套',
      component: 'vxe-select',
      optionsSourceKey: 'accounts',
      optionProps: {
        label: 'label',
        value: 'account_id'
      },
      props: {
        placeholder: '请选择账套',
        clearable: true,
        filterable: true
      },
      rules: [{ required: true, message: '请选择账套' }]
    }
  ],
  actions: []
};

export const signUpSchema: LowCodeFormSchema = {
  columns: 1,
  fields: [
    {
      field: 'email',
      label: '邮箱',
      component: 'vxe-input',
      props: {
        placeholder: 'name@example.com',
        type: 'email',
        clearable: true
      },
      rules: [{ required: true, message: '请输入邮箱地址' }]
    },
    {
      field: 'password',
      label: '密码',
      component: 'vxe-password-input',
      props: {
        placeholder: '请输入密码',
        clearable: true
      },
      rules: [
        { required: true, message: '请输入密码' },
        { min: 6, message: '密码至少需要 6 个字符' }
      ]
    }
  ],
  actions: [
    {
      code: 'submit',
      label: '创建账号',
      type: 'submit',
      status: 'primary'
    }
  ]
};
