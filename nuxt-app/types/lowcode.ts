export type LowCodeOption = {
  label: string;
  value: string | number;
};

export type LowCodeRule = {
  required?: boolean;
  min?: number;
  message: string;
};

export type LowCodeField = {
  field: string;
  label: string;
  component:
    | 'vxe-input'
    | 'vxe-textarea'
    | 'vxe-select'
    | 'vxe-switch'
    | 'vxe-password-input'
    | 'vxe-checkbox-group'
    | 'vxe-radio-group'
    | 'vxe-tree-select';
  help?: string;
  props?: Record<string, unknown>;
  options?: LowCodeOption[];
  optionsSourceKey?: string;
  optionProps?: Record<string, unknown>;
  rules?: LowCodeRule[];
  span?: number;
};

export type LowCodeFormLayoutColumn = {
  span?: number | string;
  blocks: LowCodeFormLayoutNode[];
};

export type LowCodeFormLayoutNode =
  | {
      kind: 'field';
      field: string;
    }
  | {
      kind: 'row';
      gutter?: number | string;
      columns: LowCodeFormLayoutColumn[];
    }
  | {
      kind: 'stack';
      blocks: LowCodeFormLayoutNode[];
    };

export type LowCodeGridFormatter =
  | {
      type: 'text';
      emptyText?: string;
    }
  | {
      type: 'date';
      locale?: string;
      options?: Intl.DateTimeFormatOptions;
      emptyText?: string;
    }
  | {
      type: 'datetime';
      locale?: string;
      options?: Intl.DateTimeFormatOptions;
      emptyText?: string;
    }
  | {
      type: 'currency';
      locale?: string;
      currency?: string;
      options?: Intl.NumberFormatOptions;
      emptyText?: string;
    }
  | {
      type: 'number';
      locale?: string;
      options?: Intl.NumberFormatOptions;
      emptyText?: string;
    }
  | {
      type: 'enum';
      map: Record<string, string>;
      emptyText?: string;
    };

export type LowCodeGridColumn = {
  field?: string;
  title: string;
  width?: number;
  minWidth?: number;
  fixed?: 'left' | 'right';
  align?: 'left' | 'center' | 'right';
  type?: string;
  formatter?: LowCodeGridFormatter | ((params: { cellValue: unknown }) => string);
  slots?: { default?: string };
};

export type LowCodeAction = {
  code: string;
  label: string;
  type?: 'submit' | 'reset' | 'button';
  variant?: 'button' | 'link';
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  route?: string;
  disabled?: boolean;
  handler?:
    | {
        type: 'auth.signInWithPassword';
        emailField?: string;
        passwordField?: string;
        successRoute?: string;
        successMessage?: string;
        errorMessage?: string;
      }
    | {
        type: 'auth.signUp';
        emailField?: string;
        passwordField?: string;
        successRoute?: string;
        successMessage?: string;
        errorMessage?: string;
      }
    | {
        type: 'auth.signInWithOAuth';
        provider: string;
        errorMessage?: string;
      };
};

export type LowCodeFormSchema = {
  title?: string;
  columns?: number;
  fields: LowCodeField[];
  layout?: LowCodeFormLayoutNode[];
  actions: LowCodeAction[];
};

export type LowCodeGridAction = {
  code: string;
  label: string;
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
};

export type LowCodeGridSchema = {
  title?: string;
  toolbar?: LowCodeGridAction[];
  grid: Record<string, unknown> & {
    columns?: LowCodeGridColumn[];
    rowConfig?: Record<string, unknown>;
  };
  rowActions?: {
    edit?: boolean;
    editLabel?: string;
    editRoute?: string;
    delete?: boolean;
    deleteLabel?: string;
  };
};

export type LowCodePageDataSource = {
  key: string;
  label?: string;
  serviceName: string;
  serviceMethod: string;
  saveMethod?: string;
  deleteMethod?: string;
  postData?: Record<string, unknown>;
  autoLoad?: boolean;
};

export type LowCodePageTextBlock = {
  id: string;
  kind: 'text';
  title?: string;
  content: string;
  tone?: 'default' | 'muted' | 'success' | 'warning';
};

export type LowCodePageContainerBlock = {
  id: string;
  kind: 'container';
  title?: string;
  description?: string;
  columns?: number;
  gap?: number;
  panel?: boolean;
  blocks: LowCodePageBlock[];
};

export type LowCodePageSectionBlock = {
  id: string;
  kind: 'section';
  title?: string;
  description?: string;
  panel?: boolean;
  blocks: LowCodePageBlock[];
};

export type LowCodeTabPane = {
  key: string;
  label: string;
  blocks: LowCodePageBlock[];
};

export type LowCodePageTabsBlock = {
  id: string;
  kind: 'tabs';
  title?: string;
  description?: string;
  defaultKey?: string;
  tabs: LowCodeTabPane[];
};

export type LowCodePageToolbarBlock = {
  id: string;
  kind: 'toolbar';
  title?: string;
  description?: string;
  actions: LowCodeAction[];
};

export type LowCodePageFormBlock = {
  id: string;
  kind: 'form';
  title?: string;
  description?: string;
  panel?: boolean;
  schema: LowCodeFormSchema;
  sourceKey?: string;
  submitSourceKey?: string;
  initialValues?: Record<string, unknown>;
};

export type LowCodePageSearchFormBlock = {
  id: string;
  kind: 'searchForm';
  title?: string;
  description?: string;
  schema: LowCodeFormSchema;
  targetSourceKey?: string;
  initialValues?: Record<string, unknown>;
};

export type LowCodePageGridBlock = {
  id: string;
  kind: 'grid';
  title?: string;
  description?: string;
  schema: LowCodeGridSchema;
  sourceKey?: string;
  editorBlockId?: string;
  editRoute?: string;
  deleteSourceKey?: string;
  rows?: Record<string, unknown>[];
};

export type LowCodeDetailField = {
  field: string;
  label: string;
  formatter?: LowCodeGridFormatter;
};

export type LowCodePageDetailBlock = {
  id: string;
  kind: 'detail';
  title?: string;
  description?: string;
  sourceKey?: string;
  record?: Record<string, unknown>;
  fields: LowCodeDetailField[];
};

export type LowCodePageModalBlock = {
  id: string;
  kind: 'modal';
  title?: string;
  description?: string;
  open?: boolean;
  width?: number | string;
  blocks: LowCodePageBlock[];
};

export type LowCodePageDrawerBlock = {
  id: string;
  kind: 'drawer';
  title?: string;
  description?: string;
  open?: boolean;
  width?: number | string;
  placement?: 'left' | 'right';
  blocks: LowCodePageBlock[];
};

export type LowCodeStatItem = {
  label: string;
  value?: string | number;
  field?: string;
  suffix?: string;
  formatter?: LowCodeGridFormatter;
};

export type LowCodePageStatCardBlock = {
  id: string;
  kind: 'statCard';
  title?: string;
  description?: string;
  sourceKey?: string;
  items: LowCodeStatItem[];
};

export type LowCodePageTreeBlock = {
  id: string;
  kind: 'tree';
  title?: string;
  description?: string;
  sourceKey?: string;
  rows?: Record<string, unknown>[];
  keyField?: string;
  titleField?: string;
  childrenField?: string;
};

export type LowCodePageBlock =
  | LowCodePageTextBlock
  | LowCodePageContainerBlock
  | LowCodePageSectionBlock
  | LowCodePageTabsBlock
  | LowCodePageToolbarBlock
  | LowCodePageFormBlock
  | LowCodePageSearchFormBlock
  | LowCodePageGridBlock
  | LowCodePageDetailBlock
  | LowCodePageModalBlock
  | LowCodePageDrawerBlock
  | LowCodePageStatCardBlock
  | LowCodePageTreeBlock;

export type LowCodePageSchema = {
  code: string;
  route: string;
  title: string;
  description?: string;
  layout?: 'default' | 'dashboard' | 'blank';
  status?: 'draft' | 'published' | 'archived';
  keepAlive?: boolean;
  visualEditor?: Record<string, unknown>;
  config?: {
    bgColor?: string;
    bgImage?: string;
    shellClass?: string;
    pageClass?: string;
    showIntro?: boolean;
  };
  dataSources?: Record<string, LowCodePageDataSource>;
  blocks: LowCodePageBlock[];
};

export type LowCodePageRecord = {
  id: string;
  code: string;
  route: string;
  title: string;
  description: string | null;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  schema: LowCodePageSchema;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LowCodePageSummary = Pick<
  LowCodePageRecord,
  'id' | 'code' | 'route' | 'title' | 'description' | 'layout' | 'status' | 'keep_alive' | 'version' | 'published_at' | 'created_at' | 'updated_at'
>;
