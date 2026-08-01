import type { VxeButtonProps } from 'vxe-pc-ui';

export type LowCodeOption = {
  label: string;
  value: string | number;
  rawValue?: unknown;
  disabled?: boolean;
};

export type LowCodeRule = {
  required?: boolean;
  min?: number;
  message: string;
};

export type LowCodeBuiltInFieldComponent =
  | 'vxe-input'
  | 'vxe-textarea'
  | 'vxe-select'
  | 'vxe-switch'
  | 'vxe-password-input'
  | 'vxe-checkbox-group'
  | 'vxe-radio-group'
  | 'vxe-tree-select'
  | 'lc-cascader'
  | 'lc-array-table'
  | 'lc-color-picker'
  | 'lc-json-editor'
  | 'lc-number-input'
  | 'lc-option-select'
  | 'lc-sub-form';

export type LowCodeFieldComponent = LowCodeBuiltInFieldComponent | (string & {});

export type LowCodeField = {
  field: string;
  label: string;
  component: LowCodeFieldComponent;
  help?: string;
  props?: Record<string, unknown>;
  options?: LowCodeOption[];
  optionsSourceKey?: string;
  optionProps?: Record<string, unknown>;
  rules?: LowCodeRule[];
  span?: number;
  events?: Record<string, LowCodeRuntimeDirective[]>;
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
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  fixed?: 'left' | 'right' | '';
  align?: 'left' | 'center' | 'right' | '';
  headerAlign?: 'left' | 'center' | 'right' | '';
  footerAlign?: 'left' | 'center' | 'right' | '';
  type?: string;
  sortable?: boolean;
  resizable?: boolean;
  visible?: boolean;
  showOverflow?: boolean | 'ellipsis' | 'title' | 'tooltip' | '';
  showHeaderOverflow?: boolean | 'ellipsis' | 'title' | 'tooltip' | '';
  showFooterOverflow?: boolean | 'ellipsis' | 'title' | 'tooltip' | '';
  formatter?: LowCodeGridFormatter | string | ((params: { cellValue: unknown }) => string);
  filters?: unknown[];
  cellRender?: Record<string, unknown>;
  editRender?: Record<string, unknown>;
  params?: Record<string, unknown>;
  slots?: { default?: string };
  [key: string]: unknown;
};

export type LowCodeRuntimeEvent = {
  name: string;
  blockId?: string;
  blockKind?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
};

export type LowCodeDirectiveMode =
  | 'replace'
  | 'merge'
  | 'append'
  | 'prepend'
  | 'patch'
  | 'remove';

export type LowCodeRuntimeDirective = {
  type: string;
  disabled?: boolean;
  when?: string | boolean;
  mode?: LowCodeDirectiveMode;
  sourceKey?: string;
  sourceKeys?: string[];
  blockId?: string;
  field?: string;
  value?: unknown;
  values?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  row?: Record<string, unknown>;
  rowKey?: string;
  route?: string;
  event?: string;
  payload?: Record<string, unknown>;
  message?: string;
  status?: 'success' | 'error' | 'info' | 'warning';
  serviceName?: string;
  serviceMethod?: string;
  postData?: Record<string, unknown> | string;
  assignTo?: string;
  refreshSourceKeys?: string[];
  [key: string]: unknown;
};

export type LowCodeEventHandler = {
  id?: string;
  event: string;
  blockId?: string;
  blockKind?: string;
  actionCode?: string;
  field?: string;
  disabled?: boolean;
  directives: LowCodeRuntimeDirective[];
};

export type LowCodeAction = {
  code: string;
  label: string;
  type?: 'submit' | 'reset' | 'button';
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  route?: string;
  disabled?: boolean;
  eventName?: string;
  directives?: LowCodeRuntimeDirective[];
};

export type LowCodeButtonGroupAction = Omit<LowCodeAction, 'status' | 'type'> &
  Pick<
    Partial<VxeButtonProps>,
    | 'size'
    | 'type'
    | 'mode'
    | 'className'
    | 'name'
    | 'routerLink'
    | 'permissionCode'
    | 'title'
    | 'content'
    | 'placement'
    | 'status'
    | 'icon'
    | 'prefixIcon'
    | 'suffixIcon'
    | 'round'
    | 'circle'
    | 'disabled'
    | 'loading'
    | 'trigger'
    | 'align'
    | 'showDropdownIcon'
    | 'destroyOnClose'
    | 'transfer'
    | 'popupConfig'
  > & {
  type?: LowCodeAction['type'] | VxeButtonProps['type'];
  status?: LowCodeAction['status'] | VxeButtonProps['status'];
  text?: boolean;
  children?: LowCodeButtonGroupAction[];
};

export type LowCodeFormSchema = {
  title?: string;
  columns?: number;
  fields: LowCodeField[];
  layout?: LowCodeFormLayoutNode[];
  actions: LowCodeAction[];
};

export type LowCodeFormModel = Record<string, unknown>;

export type LowCodeFormProps = {
  schema: LowCodeFormSchema;
  modelValue: LowCodeFormModel;
  optionSources?: Record<string, unknown>;
  loading?: boolean;
  size?: string;
  collapseStatus?: boolean;
  span?: number | string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  border?: boolean;
  titleBackground?: boolean;
  titleBold?: boolean;
  titleAlign?: 'left' | 'center' | 'right';
  titleWidth?: number | string;
  titleColon?: boolean;
  titleAsterisk?: boolean;
  titleOverflow?: boolean | 'ellipsis' | 'title' | 'tooltip';
  vertical?: boolean;
  padding?: boolean;
  className?: string;
  readonly?: boolean;
  disabled?: boolean;
  rules?: Record<string, unknown>;
  preventSubmit?: boolean;
  validConfig?: Record<string, unknown>;
  tooltipConfig?: Record<string, unknown>;
  collapseConfig?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

export type LowCodeGridAction = {
  code: string;
  label: string;
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  icon?: string;
  disabled?: boolean;
  eventName?: string;
  directives?: LowCodeRuntimeDirective[];
};

export type LowCodeGridRowAction = LowCodeGridAction & {
  plain?: boolean;
  text?: boolean;
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
    actions?: LowCodeGridRowAction[];
  };
  events?: Record<string, LowCodeRuntimeDirective[]>;
  eventNames?: Record<string, string>;
};

export type LowCodePageDataSource = {
  key: string;
  label?: string;
  serviceName?: string;
  serviceMethod?: string;
  saveMethod?: string;
  deleteMethod?: string;
  entityCode?: string;
  entity_code?: string;
  tableName?: string;
  table_name?: string;
  postData?: Record<string, unknown>;
  autoLoad?: boolean;
};

export type LowCodePageType = 'list' | 'edit' | 'detail' | 'custom';

export type LowCodePageOpenType = 'page' | 'drawer' | 'modal';

export type LowCodePageRelation = {
  id?: string;
  sourcePageId?: string;
  sourcePageCode: string;
  sourcePageRoute?: string;
  sourcePageTitle?: string;
  actionKey: string;
  targetPageId?: string;
  targetPageCode: string;
  targetPageRoute?: string;
  targetPageTitle?: string;
  openType: LowCodePageOpenType;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type LowCodePageRelations = {
  outgoing: LowCodePageRelation[];
  incoming: LowCodePageRelation[];
};

export type LowCodeMaterialVersionedBlock = {
  materialVersion?: string;
  className?: unknown;
  style?: unknown;
  layout?: {
    fillRemaining?: boolean;
  };
};

export type LowCodePageTextBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'text';
  title?: string;
  content: string;
  tone?: 'default' | 'muted' | 'success' | 'warning';
};

export type LowCodePageContainerBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'container';
  title?: string;
  description?: string;
  columns?: number;
  gap?: number;
  panel?: boolean;
  blocks: LowCodePageBlock[];
};

export type LowCodePageSectionBlock = LowCodeMaterialVersionedBlock & {
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

export type LowCodePageTabsBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'tabs';
  title?: string;
  description?: string;
  defaultKey?: string;
  tabs: LowCodeTabPane[];
};

export type LowCodePageToolbarBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'toolbar';
  title?: string;
  description?: string;
  actions: LowCodeAction[];
};

export type LowCodePageButtonGroupBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'buttonGroup';
  title?: string;
  description?: string;
  align?: 'left' | 'center' | 'right' | 'space-between';
  gap?: number | string;
  actions: LowCodeButtonGroupAction[];
};

export type LowCodePageFormBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'form';
  title?: string;
  description?: string;
  schema: LowCodeFormSchema;
  sourceKey?: string;
  submitSourceKey?: string;
  initialValues?: Record<string, unknown>;
};

export type LowCodePageSearchFormBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'searchForm';
  title?: string;
  description?: string;
  schema: LowCodeFormSchema;
  targetSourceKey?: string;
  initialValues?: Record<string, unknown>;
};

export type LowCodePageGridBlock = LowCodeMaterialVersionedBlock & {
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

export type LowCodePageDetailBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'detail';
  title?: string;
  description?: string;
  sourceKey?: string;
  record?: Record<string, unknown>;
  fields: LowCodeDetailField[];
};

export type LowCodePageModalBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'modal';
  title?: string;
  description?: string;
  open?: boolean;
  width?: number | string;
  blocks: LowCodePageBlock[];
  overlays?: LowCodePageOverlayBlock[];
};

export type LowCodePageDrawerBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'drawer';
  title?: string;
  description?: string;
  open?: boolean;
  width?: number | string;
  placement?: 'left' | 'right';
  blocks: LowCodePageBlock[];
  overlays?: LowCodePageOverlayBlock[];
};

export type LowCodeStatItem = {
  label: string;
  value?: string | number;
  field?: string;
  suffix?: string;
  formatter?: LowCodeGridFormatter;
};

export type LowCodePageStatCardBlock = LowCodeMaterialVersionedBlock & {
  id: string;
  kind: 'statCard';
  title?: string;
  description?: string;
  sourceKey?: string;
  items: LowCodeStatItem[];
};

export type LowCodePageTreeBlock = LowCodeMaterialVersionedBlock & {
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
  | LowCodePageButtonGroupBlock
  | LowCodePageFormBlock
  | LowCodePageSearchFormBlock
  | LowCodePageGridBlock
  | LowCodePageDetailBlock
  | LowCodePageModalBlock
  | LowCodePageDrawerBlock
  | LowCodePageStatCardBlock
  | LowCodePageTreeBlock;

export type LowCodePageOverlayBlock = LowCodePageModalBlock | LowCodePageDrawerBlock;

export type LowCodePageSchema = {
  schemaVersion?: number;
  code: string;
  route: string;
  title: string;
  pageType?: LowCodePageType;
  description?: string;
  layout?: 'default' | 'dashboard' | 'blank';
  status?: 'draft' | 'published' | 'archived';
  keepAlive?: boolean;
  visualEditor?: Record<string, unknown>;
  config?: {
    bgColor?: string;
    bgImage?: string;
  };
  dataSources?: Record<string, LowCodePageDataSource>;
  eventHandlers?: LowCodeEventHandler[];
  blocks: LowCodePageBlock[];
  overlays?: LowCodePageOverlayBlock[];
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
  edit_page_id: string | null;
  schema: LowCodePageSchema;
  relations?: LowCodePageRelations;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LowCodePageSummary = Pick<
  LowCodePageRecord,
  'id' | 'code' | 'route' | 'title' | 'description' | 'layout' | 'status' | 'keep_alive' | 'edit_page_id' | 'version' | 'published_at' | 'created_at' | 'updated_at'
>;
