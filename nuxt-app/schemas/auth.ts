import type {
  LowCodeFormSchema,
  LowCodePageRecord,
  LowCodePageSchema
} from '~/types/lowcode';

export const signInSchema: LowCodeFormSchema = {
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
      label: 'Sign in',
      type: 'submit',
      status: 'primary',
      handler: {
        type: 'auth.signInWithPassword',
        successRoute: '/dashboard',
        errorMessage: 'You could not be signed in.'
      }
    },
    {
      code: 'github',
      label: 'Sign in with GitHub',
      type: 'button',
      handler: {
        type: 'auth.signInWithOAuth',
        provider: 'github',
        errorMessage: 'GitHub sign in failed.'
      }
    },
    {
      code: 'signup',
      label: 'Do not have an account? Sign up',
      type: 'button',
      variant: 'link',
      route: '/signup'
    }
  ]
};

export const signUpSchema: LowCodeFormSchema = {
  columns: 1,
  fields: signInSchema.fields,
  actions: [
    {
      code: 'submit',
      label: 'Create account',
      type: 'submit',
      status: 'primary'
    }
  ]
};

export const signInPageSchema: LowCodePageSchema = {
  code: 'signin',
  route: '/signin',
  title: 'Sign In',
  description: 'Enter your email and password to access your account.',
  layout: 'blank',
  status: 'published',
  keepAlive: false,
  config: {
    shellClass: 'auth-shell',
    pageClass: 'auth-panel auth-lowcode-panel'
  },
  blocks: [
    {
      id: 'signin-login-form',
      kind: 'form',
      panel: false,
      schema: signInSchema,
      initialValues: {
        email: '',
        password: ''
      }
    }
  ]
};

export const signInLowCodePage: LowCodePageRecord = {
  id: 'signin-static-lowcode-page',
  code: signInPageSchema.code,
  route: signInPageSchema.route,
  title: signInPageSchema.title,
  description: signInPageSchema.description ?? null,
  layout: 'blank',
  status: 'published',
  keep_alive: false,
  schema: signInPageSchema,
  version: 1,
  published_at: null,
  created_at: '',
  updated_at: ''
};
