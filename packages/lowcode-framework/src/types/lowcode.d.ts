import type { VxeButtonProps } from 'vxe-pc-ui';
import type { LowCodeRowActionPredicate } from '../runtime/row-action-state';
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
export type LowCodeBuiltInFieldComponent = 'vxe-input' | 'vxe-textarea' | 'vxe-select' | 'vxe-switch' | 'vxe-password-input' | 'vxe-checkbox-group' | 'vxe-radio-group' | 'vxe-tree-select' | 'lc-cascader' | 'lc-array-table' | 'lc-color-picker' | 'lc-json-editor' | 'lc-monaco-editor' | 'lc-number-input' | 'lc-option-select' | 'base-info' | 'lc-sub-form';
export type LowCodeFieldComponent = LowCodeBuiltInFieldComponent | (string & {});
export type LowCodeRelateInfoFieldMapping = {
    sourceField: string;
    targetField: string;
};
export type LowCodeRelateInfoConfig = {
    sourceType?: 'entity' | 'lowcode_page' | 'lowcodePage';
    resource?: string;
    tableName?: string;
    viewName?: string;
    entityCode?: string;
    pageId?: string;
    pageCode?: string;
    pageRoute?: string;
    lowcodePage?: string;
    sourceKey?: string;
    serviceName?: string;
    serviceMethod?: string;
    postData?: Record<string, unknown>;
    resultPath?: string;
    valueField?: string;
    displayField?: string | string[];
    displayValueField?: string;
    fieldMappings?: LowCodeRelateInfoFieldMapping[];
    mappings?: LowCodeRelateInfoFieldMapping[] | Record<string, string>;
    columns?: LowCodeGridColumn[];
    searchField?: string;
    searchFields?: string[];
    searchable?: boolean;
    searchPlaceholder?: string;
    pageSize?: number;
    rowKey?: string;
    popupWidth?: number | string;
    popupHeight?: number | string;
    reloadOnFocus?: boolean;
    allowInput?: boolean;
};
export type LowCodePageRelateConfig = {
    category?: string;
    parentCategory?: string;
    relatedPageCode?: string;
    [key: string]: unknown;
};
export type LowCodeField = {
    field: string;
    label: string;
    component: LowCodeFieldComponent;
    showTitle?: boolean;
    help?: string;
    props?: Record<string, unknown>;
    options?: LowCodeOption[];
    optionsCode?: string;
    optionsSourceKey?: string;
    optionProps?: Record<string, unknown>;
    rules?: LowCodeRule[];
    span?: number;
    events?: Record<string, LowCodeRuntimeDirective[]>;
    /** Disable this field while the edit page is creating or copying a record. */
    createDisabled?: boolean;
    /** Disable this field while the edit page is modifying an existing record. */
    editDisabled?: boolean;
    /** Resolve the initial value through an isolated script or a database procedure. */
    defaultValueType?: 'function' | 'procedure';
    defaultValueScript?: string;
    defaultValueProcedure?: string;
    /** Run after the field value changes. */
    updateScript?: string;
    /** Return true/null for success, false for validationMessage, or a string/Error-like message. */
    validationScript?: string;
    validationMessage?: string;
};
export type LowCodeFormLayoutColumn = {
    span?: number | string;
    blocks: LowCodeFormLayoutNode[];
};
export type LowCodeFormLayoutTab = {
    key: string;
    label: string;
    blocks: LowCodeFormLayoutNode[];
};
export type LowCodeFormLayoutNode = {
    kind: 'field';
    field: string;
} | {
    kind: 'row';
    gutter?: number | string;
    columns: LowCodeFormLayoutColumn[];
} | {
    kind: 'stack';
    blocks: LowCodeFormLayoutNode[];
} | {
    kind: 'tabs';
    fillRemaining?: boolean;
    defaultKey?: string;
    tabs: LowCodeFormLayoutTab[];
};
export type LowCodeGridFormatter = {
    type: 'text';
    emptyText?: string;
} | {
    type: 'date';
    locale?: string;
    options?: Intl.DateTimeFormatOptions;
    emptyText?: string;
} | {
    type: 'datetime';
    locale?: string;
    options?: Intl.DateTimeFormatOptions;
    emptyText?: string;
} | {
    type: 'currency';
    locale?: string;
    currency?: string;
    options?: Intl.NumberFormatOptions;
    emptyText?: string;
} | {
    type: 'number';
    locale?: string;
    options?: Intl.NumberFormatOptions;
    emptyText?: string;
} | {
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
    formatter?: LowCodeGridFormatter | string | ((params: {
        cellValue: unknown;
    }) => string);
    filters?: unknown[];
    cellRender?: Record<string, unknown>;
    editRender?: Record<string, unknown>;
    params?: Record<string, unknown>;
    slots?: {
        default?: string;
        edit?: string;
    };
    [key: string]: unknown;
};
export type LowCodeRuntimeEvent = {
    name: string;
    blockId?: string;
    blockKind?: string;
    timestamp?: number;
    payload?: Record<string, unknown>;
};
export type LowCodeDirectiveMode = 'replace' | 'merge' | 'append' | 'prepend' | 'patch' | 'remove';
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
    script?: string;
    directives?: LowCodeRuntimeDirective[];
};
export type LowCodeButtonGroupAction = Omit<LowCodeAction, 'status' | 'type'> & Pick<Partial<VxeButtonProps>, 'size' | 'type' | 'mode' | 'className' | 'name' | 'routerLink' | 'permissionCode' | 'title' | 'content' | 'placement' | 'status' | 'icon' | 'prefixIcon' | 'suffixIcon' | 'round' | 'circle' | 'disabled' | 'loading' | 'trigger' | 'align' | 'showDropdownIcon' | 'destroyOnClose' | 'transfer' | 'popupConfig'> & {
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
export type LowCodeSubFormProps = Record<string, unknown> & {
    schema: LowCodeFormSchema;
    fields?: never;
    columns?: never;
    layout?: never;
    actions?: never;
};
export type LowCodeSubFormField = Omit<LowCodeField, 'component' | 'props'> & {
    component: 'lc-sub-form';
    props: LowCodeSubFormProps;
};
export type LowCodeFormModel = Record<string, unknown>;
/** Runtime state shared by every edit page. */
export type LowCodeEditPageMode = 'scan' | 'edit' | 'add';
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
    mode?: LowCodeEditPageMode;
    rules?: Record<string, unknown[]>;
    preventSubmit?: boolean;
    validConfig?: Record<string, unknown>;
    tooltipConfig?: Record<string, unknown>;
    collapseConfig?: Record<string, unknown>;
    params?: Record<string, unknown>;
    labelContextMenu?: boolean;
};
export type LowCodeGridAction = {
    code: string;
    label: string;
    status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
    icon?: string;
    permissionCode?: string;
    disabled?: boolean;
    eventName?: string;
    script?: string;
    directives?: LowCodeRuntimeDirective[];
};
export type LowCodeGridRowAction = LowCodeGridAction & {
    visible?: LowCodeRowActionPredicate;
    when?: LowCodeRowActionPredicate;
    disabled?: LowCodeRowActionPredicate;
    plain?: boolean;
    text?: boolean;
};
export type LowCodeGridDetailConfig = {
    enabled?: boolean;
    parentSourceKey: string;
    resource: string;
    foreignKey: string;
    parentKey?: string;
    inheritFields?: string[];
    updateMode?: 'replace' | 'changes';
    defaults?: Record<string, unknown>;
    stripCreatedKey?: boolean;
};
export type LowCodeGridSchema = {
    title?: string;
    toolbar?: LowCodeGridAction[];
    grid: Record<string, unknown> & {
        columns?: LowCodeGridColumn[];
        rowConfig?: Record<string, unknown>;
        mobileDisplay?: 'table' | 'card';
        rowHeight?: number;
        headerHeight?: number;
        overscanRowCount?: number;
        overscanColumnCount?: number;
    };
    detailConfig?: LowCodeGridDetailConfig;
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
/**
 * 低代码页面的数据源定义。
 *
 * 页面加载时，运行时会遍历 `schema.dataSources`，调用配置的后端服务，
 * 再将响应结果保存到对应的数据源 key 下，供表格、表单等区块通过
 * `sourceKey` 使用。
 */
export type LowCodePageDataSource = {
    /**
     * 数据源的唯一标识。
     * 应与 `schema.dataSources` 中的属性名一致，例如 `dataSources.pages.key = 'pages'`。
     */
    key: string;
    /** 数据源的可读名称，主要用于设计器和界面展示，不参与接口路由。 */
    label?: string;
    /** 表格设计器中的来源类型，用于区分自定义服务、真实表和数据库视图。 */
    sourceType?: 'custom' | 'table' | 'view';
    /**
     * 后端服务名，对应 `serviceApi.invoke(serviceName, ...)` 的第一个参数，
     * 例如 `admin`、`lowcode`、`notification`。
     */
    serviceName?: string;
    /**
     * 读取数据时调用的服务方法，对应 `serviceApi.invoke(..., serviceMethod, ...)`
     * 的第二个参数；列表数据通常使用 `listItems`。
     */
    serviceMethod?: string;
    /** 表单提交时调用的服务方法；请求参数由 `postData` 和表单值合并得到。 */
    saveMethod?: string;
    /** 表格删除行时调用的服务方法；请求参数由 `postData` 和当前行数据合并得到。 */
    deleteMethod?: string;
    /**
     * 逻辑实体编码。运行时可据此推导实际表名，并按实体列表方式读取数据。
     * 新配置优先使用 camelCase 字段 `entityCode`。
     */
    entityCode?: string;
    /** `entityCode` 的 snake_case 兼容字段，用于读取历史或后端生成的配置。 */
    entity_code?: string;
    /**
     * 实际数据库表名，例如 `lowcode_pages`。配置后，运行时会将其补入请求参数，
     * 并默认通过 `admin.listItems` 读取该表。
     */
    /** Physical-table association shown by the grid designer; custom sources keep their own service request. */
    tableName?: string;
    /** `tableName` 的 snake_case 兼容字段，新配置优先使用 `tableName`。 */
    table_name?: string;
    /** 关联的数据库视图名；实际查询仍通过 `tableName` 传给列表服务。 */
    viewName?: string;
    /**
     * 传给服务方法的基础请求参数，例如 `resource`、`filters`、`sorts`、
     * `page` 和 `pageSize`。运行时还会按场景合并查询条件、表单值或行数据。
     *
     * 若填写 `resource`，必须使用后端注册的资源名；本项目通常与真实表名一致，
     * 例如应使用 `lowcode_pages`，不能使用旧别名 `pages`。
     */
    postData?: Record<string, unknown>;
    /**
     * 是否在页面初始化时自动读取数据，默认 `true`。
     * 设为 `false` 时跳过首次加载，但仍可由刷新动作或运行时指令主动加载。
     */
    autoLoad?: boolean;
    /** Data sources that must finish and hydrate their bound forms before this source loads. */
    loadAfterSourceKeys?: string[];
};
/** A page-owned, named service endpoint callable from an isolated page script. */
export type LowCodePageApi = {
    serviceName: string;
    serviceMethod: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    postData?: Record<string, unknown>;
    resultPath?: string;
};
/** A reusable page-owned script callable through `this.executeFunction`. */
export type LowCodePageFunction = {
    name: string;
    label?: string;
    description?: string;
    enabled?: boolean;
    script: string;
};
export type LowCodePageType = 'list' | 'edit' | 'detail' | 'custom';
export type LowCodeMaterialVersionedBlock = {
    materialVersion?: string;
    className?: unknown;
    style?: unknown;
    layout?: {
        fillRemaining?: boolean;
    };
    hooks?: LowCodeExecuteActionHook[];
};
export type LowCodeExecuteActionHook = {
    name?: string;
    phase?: 'before' | 'after';
    method?: string;
    enabled?: boolean;
    critical?: boolean;
    script: string;
};
export type LowCodeNodeActionParameter = {
    name: string;
    type: string;
    required?: boolean;
    description: string;
};
export type LowCodeNodeActionDefinition = {
    id: string;
    node_type: string;
    node_label: string;
    node_icon: string;
    action_code: string;
    label: string;
    description: string;
    source_code: string;
    parameters: LowCodeNodeActionParameter[];
    returns: string;
    insert_text_template: string;
    applicable_when: Record<string, unknown>;
    is_data_source_loader: boolean;
    enabled: boolean;
    is_system: boolean;
    sort_order: number;
    limits: import('../runtime/scripts').LowCodeScriptExecutionLimits;
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
    formType?: 'edit' | 'search' | 'default';
    title?: string;
    description?: string;
    schema: LowCodeFormSchema;
    dataSource?: LowCodePageDataSource;
    initialValues?: Record<string, unknown>;
    formDesignerModel?: Record<string, unknown>;
    formDesignerUpdatedAt?: number;
};
export type LowCodePageSearchFormBlock = LowCodeMaterialVersionedBlock & {
    id: string;
    kind: 'searchForm';
    title?: string;
    description?: string;
    schema: LowCodeFormSchema;
    targetSourceKey?: string;
    targetSourceKeys?: string[];
    initialValues?: Record<string, unknown>;
    formDesignerModel?: Record<string, unknown>;
    formDesignerUpdatedAt?: number;
};
export type LowCodePageGridBlock = LowCodeMaterialVersionedBlock & {
    id: string;
    kind: 'grid';
    title?: string;
    description?: string;
    schema: LowCodeGridSchema;
    /** Apply the runtime search values to the returned rows in the browser. */
    clientFilter?: boolean;
    /** Grid role in a default or master-detail layout. */
    tableType?: 'main' | 'detail' | 'default';
    /** Data-source association used by the grid designer. */
    sourceType?: 'custom' | 'table' | 'view';
    tableName?: string;
    viewName?: string;
    /** Field on the main table that stores the selected page-category id. */
    categoryField?: string;
    editorBlockId?: string;
    editRoute?: string;
    deleteSourceKey?: string;
    sourceKey?: string;
    rows?: Record<string, unknown>[];
    gridDesignerUpdatedAt?: number;
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
    resultNode?: string;
    confirmLabel?: string;
    cancelLabel?: string;
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
    resultNode?: string;
    confirmLabel?: string;
    cancelLabel?: string;
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
export type LowCodePagePlanningFlowBlock = LowCodeMaterialVersionedBlock & {
    id: string;
    kind: 'planningFlow';
    title?: string;
    description?: string;
    sourceKey?: string;
    height?: number | string;
    fitViewOnInit?: boolean;
};
export type LowCodePagePlanningGanttBlock = LowCodeMaterialVersionedBlock & {
    id: string;
    kind: 'planningGantt';
    title?: string;
    description?: string;
    sourceKey?: string;
    height?: number | string;
    rowLabelField?: string;
    startField?: string;
    endField?: string;
    labelField?: string;
    colorField?: string;
    statusField?: string;
    includedTypes?: string[];
    /** Database-backed low-code form definition code for timeline display conditions. */
    settingsFormCode?: string;
};
export type LowCodePagePlanningBomBlock = LowCodeMaterialVersionedBlock & {
    id: string;
    kind: 'planningBom';
    title?: string;
    description?: string;
    sourceKey?: string;
    rows?: Record<string, unknown>[];
    height?: number | string;
    keyField?: string;
    titleField?: string;
    childrenField?: string;
};
export type LowCodePageBlock = LowCodePageTextBlock | LowCodePageContainerBlock | LowCodePageSectionBlock | LowCodePageTabsBlock | LowCodePageToolbarBlock | LowCodePageButtonGroupBlock | LowCodePageFormBlock | LowCodePageSearchFormBlock | LowCodePageGridBlock | LowCodePageDetailBlock | LowCodePageModalBlock | LowCodePageDrawerBlock | LowCodePageStatCardBlock | LowCodePageTreeBlock | LowCodePagePlanningFlowBlock | LowCodePagePlanningGanttBlock | LowCodePagePlanningBomBlock;
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
    apis?: Record<string, LowCodePageApi>;
    functions?: LowCodePageFunction[];
    eventHandlers?: LowCodeEventHandler[];
    scriptPolicy?: {
        apiNames?: string[];
        capabilities?: import('../runtime/scripts').LowCodeScriptCapabilityName[];
        context?: {
            dataSourceKeys?: string[];
            formBlockIds?: string[];
            searchSourceKeys?: string[];
            gridBlockIds?: string[];
        };
        limits?: import('../runtime/scripts').LowCodeScriptExecutionLimits;
    };
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
    page_type: LowCodePageType;
    edit_page_id: string | null;
    view_name: string | null;
    table_name: string | null;
    relate_config: LowCodePageRelateConfig;
    schema: LowCodePageSchema;
    node_actions?: LowCodeNodeActionDefinition[];
    version: number;
    published_at: string | null;
    created_at: string;
    updated_at: string;
};
export type LowCodePageSummary = Pick<LowCodePageRecord, 'id' | 'code' | 'route' | 'title' | 'description' | 'layout' | 'status' | 'keep_alive' | 'page_type' | 'edit_page_id' | 'view_name' | 'table_name' | 'relate_config' | 'version' | 'published_at' | 'created_at' | 'updated_at'>;
