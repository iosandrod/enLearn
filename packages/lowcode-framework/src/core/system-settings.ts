import {
  inject,
  provide,
  type InjectionKey,
  type Ref,
} from 'vue';

export type SystemThemeMode = 'light' | 'dark' | 'system';
export type SystemPagerLayout =
  | 'PrevPage'
  | 'JumpNumber'
  | 'NextPage'
  | 'Sizes'
  | 'FullJump'
  | 'Total';

export type SystemThemeColors = {
  primary?: string;
  success?: string;
  warning?: string;
  danger?: string;
  info?: string;
  background?: string;
  surface?: string;
  text?: string;
};

export type SystemThemeConfig = Record<string, unknown> & {
  colors?: SystemThemeColors;
  radius?: number;
};

export type SystemTableConfig = Record<string, unknown> & {
  size?: string;
  stripe?: boolean;
  border?: boolean | string;
  round?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  showOverflow?: boolean | string;
  showHeaderOverflow?: boolean | string;
  showFooterOverflow?: boolean | string;
  autoHeight?: boolean;
  height?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  rowHeight?: number;
  headerRowHeight?: number;
  footerRowHeight?: number;
  rowPadding?: boolean;
  headerPadding?: boolean;
  footerPadding?: boolean;
  rowVerticalAlign?: 'top' | 'middle' | 'bottom';
  highlightHoverRow?: boolean;
  highlightCurrentRow?: boolean;
  rowResizable?: boolean;
  rowDrag?: boolean;
  columnResizable?: boolean;
  highlightHoverColumn?: boolean;
  highlightCurrentColumn?: boolean;
  columnDrag?: boolean;
  columnMinWidth?: number | string;
  maxFixedColumns?: number;
  multipleSort?: boolean;
  chronologicalSort?: boolean;
  allowClearSort?: boolean;
  sortTrigger?: string;
  showSortIcon?: boolean;
  multipleFilter?: boolean;
  remoteFilter?: boolean;
  showFilterIcon?: boolean;
  filterTransfer?: boolean;
  showFilterFooter?: boolean;
  tooltipMode?: string;
  tooltipShowAll?: boolean;
  tooltipEnterable?: boolean;
  tooltipEnterDelay?: number;
  tooltipLeaveDelay?: number;
  tooltipPlacement?: string;
  virtualXEnabled?: boolean;
  virtualXThreshold?: number;
  virtualXOverscan?: number;
  virtualYEnabled?: boolean;
  virtualYThreshold?: number;
  virtualYOverscan?: number;
  scrollToLeftOnChange?: boolean;
  scrollToTopOnChange?: boolean;
  emptyText?: string;
  numberDigits?: number;
  useGrouping?: boolean;
  percentDigits?: number;
  dateFormat?: string;
  dateTimeFormat?: string;
  timeFormat?: string;
  trueText?: string;
  falseText?: string;
  currency?: string;
  pageSize?: number;
  pageSizes?: number[];
  pagerBackground?: boolean;
  pagerAutoHidden?: boolean;
  pagerCount?: number;
  showPageSize?: boolean;
  showPageJump?: boolean;
  showPageTotal?: boolean;
};

export type SystemSettings = {
  id?: string;
  user_id?: string;
  theme_mode: SystemThemeMode;
  primary_color: string;
  theme_config: SystemThemeConfig;
  table_config: SystemTableConfig;
  language: string;
  locale_config: Record<string, unknown>;
  feature_flags: Record<string, unknown>;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
};

export type SystemSettingsContext = {
  settings: Ref<SystemSettings>;
  loading: Ref<boolean>;
  loaded: Ref<boolean>;
  error: Ref<unknown>;
  reload: () => Promise<SystemSettings>;
  reset: () => void;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  theme_mode: 'system',
  primary_color: '#2563eb',
  theme_config: {
    colors: {
      primary: '#2563eb',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0891b2',
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#0f172a',
    },
    radius: 6,
  },
  table_config: {
    configVersion: 2,
    size: 'medium',
    stripe: true,
    border: true,
    round: false,
    showHeader: true,
    showFooter: false,
    showOverflow: 'tooltip',
    showHeaderOverflow: 'tooltip',
    showFooterOverflow: 'tooltip',
    height: 520,
    minHeight: 320,
    maxHeight: 900,
    pageSize: 20,
    pageSizes: [10, 20, 50, 100],
    pagerBackground: true,
    pagerAutoHidden: false,
    pagerCount: 7,
    showPageSize: true,
    showPageJump: true,
    showPageTotal: true,
    autoHeight: true,
    rowHeight: 40,
    headerRowHeight: 42,
    footerRowHeight: 40,
    rowPadding: true,
    headerPadding: true,
    footerPadding: true,
    rowVerticalAlign: 'middle',
    highlightHoverRow: true,
    highlightCurrentRow: true,
    rowResizable: false,
    rowDrag: false,
    columnResizable: true,
    highlightHoverColumn: false,
    highlightCurrentColumn: false,
    columnDrag: false,
    columnMinWidth: 100,
    maxFixedColumns: 4,
    multipleSort: false,
    chronologicalSort: false,
    allowClearSort: true,
    sortTrigger: 'default',
    showSortIcon: true,
    multipleFilter: true,
    remoteFilter: false,
    showFilterIcon: true,
    filterTransfer: true,
    showFilterFooter: true,
    tooltipMode: 'tooltip',
    tooltipShowAll: false,
    tooltipEnterable: true,
    tooltipEnterDelay: 300,
    tooltipLeaveDelay: 200,
    tooltipPlacement: 'top',
    virtualXEnabled: true,
    virtualXThreshold: 20,
    virtualXOverscan: 2,
    virtualYEnabled: true,
    virtualYThreshold: 100,
    virtualYOverscan: 10,
    scrollToLeftOnChange: true,
    scrollToTopOnChange: true,
    emptyText: '--',
    numberDigits: 2,
    useGrouping: true,
    percentDigits: 2,
    dateFormat: 'YYYY-MM-DD',
    dateTimeFormat: 'YYYY-MM-DD HH:mm:ss',
    timeFormat: 'HH:mm:ss',
    trueText: '是',
    falseText: '否',
    currency: 'CNY',
  },
  language: 'zh-CN',
  locale_config: {
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
  },
  feature_flags: {},
  metadata: {},
};

export function resolveSystemTimezone(context?: SystemSettingsContext | null) {
  const configured = context?.settings.value.locale_config?.timezone;
  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : String(DEFAULT_SYSTEM_SETTINGS.locale_config.timezone);
}

const systemSettingsKey: InjectionKey<SystemSettingsContext> = Symbol('systemSettings');

export function provideSystemSettings(context: SystemSettingsContext) {
  provide(systemSettingsKey, context);
  return context;
}

export function useSystemSettings(required = false) {
  const context = inject(systemSettingsKey, null);
  if (!context && required) {
    throw new Error('System settings are not provided by the application root.');
  }
  return context;
}

export function cloneDefaultSystemSettings() {
  return cloneValue(DEFAULT_SYSTEM_SETTINGS);
}

export function normalizeSystemSettings(value: unknown): SystemSettings {
  const normalized = mergeRecords(
    cloneDefaultSystemSettings() as Record<string, unknown>,
    isRecord(value) ? value : {},
  ) as SystemSettings;

  // Older settings pages could persist the editable primary color inside the
  // nested theme config while leaving the top-level compatibility field at
  // its default value. Prefer that nested value during hydration so the saved
  // color is applied instead of being hidden by the default.
  const nestedColors = isRecord(normalized.theme_config?.colors)
    ? normalized.theme_config.colors
    : undefined;
  const nestedPrimary = readNonEmptyString(nestedColors?.primary);
  const topLevelPrimary = readNonEmptyString(normalized.primary_color);
  if (
    nestedPrimary &&
    (!topLevelPrimary || topLevelPrimary === DEFAULT_SYSTEM_SETTINGS.primary_color) &&
    nestedPrimary !== DEFAULT_SYSTEM_SETTINGS.primary_color
  ) {
    normalized.primary_color = nestedPrimary;
  }

  return normalized;
}

export function resolveSystemTableConfig(context?: SystemSettingsContext | null) {
  return context?.settings.value.table_config ?? DEFAULT_SYSTEM_SETTINGS.table_config;
}

export function mergeSystemTableOptions(
  explicitOptions: Record<string, unknown>,
  systemTableConfig: SystemTableConfig,
) {
  const options = { ...explicitOptions };

  applyFallback(options, 'size', systemTableConfig.size);
  applyFallback(options, 'stripe', systemTableConfig.stripe);
  applyFallback(options, 'border', systemTableConfig.border);
  applyFallback(options, 'round', systemTableConfig.round);
  applyFallback(options, 'showHeader', systemTableConfig.showHeader);
  applyFallback(options, 'showFooter', systemTableConfig.showFooter);
  applyFallback(options, 'showOverflow', systemTableConfig.showOverflow);
  applyFallback(options, 'showHeaderOverflow', systemTableConfig.showHeaderOverflow);
  applyFallback(options, 'showFooterOverflow', systemTableConfig.showFooterOverflow);
  applyFallback(options, 'emptyText', systemTableConfig.emptyText);

  if (systemTableConfig.autoHeight !== true) {
    applyFallback(options, 'height', systemTableConfig.height);
  }
  applyFallback(options, 'minHeight', systemTableConfig.minHeight);
  applyFallback(options, 'maxHeight', systemTableConfig.maxHeight);

  options.cellConfig = mergeFallbackRecord(options.cellConfig, {
    height: readExplicitHeight(
      options.cellConfig,
      options.rowConfig,
      options.rowHeight,
      systemTableConfig.rowHeight,
    ),
    padding: systemTableConfig.rowPadding,
    verticalAlign: systemTableConfig.rowVerticalAlign,
  });
  options.headerCellConfig = mergeFallbackRecord(options.headerCellConfig, {
    height: readExplicitHeight(
      options.headerCellConfig,
      undefined,
      options.headerRowHeight ?? options.headerHeight,
      systemTableConfig.headerRowHeight,
    ),
    padding: systemTableConfig.headerPadding,
  });
  options.footerCellConfig = mergeFallbackRecord(options.footerCellConfig, {
    height: readExplicitHeight(
      options.footerCellConfig,
      undefined,
      options.footerRowHeight ?? options.footerHeight,
      systemTableConfig.footerRowHeight,
    ),
    padding: systemTableConfig.footerPadding,
  });
  options.rowConfig = mergeFallbackRecord(options.rowConfig, {
    isHover: systemTableConfig.highlightHoverRow,
    isCurrent: systemTableConfig.highlightCurrentRow,
    resizable: systemTableConfig.rowResizable,
    drag: systemTableConfig.rowDrag,
  });
  options.columnConfig = mergeFallbackRecord(options.columnConfig, {
    isHover: systemTableConfig.highlightHoverColumn,
    isCurrent: systemTableConfig.highlightCurrentColumn,
    resizable: systemTableConfig.columnResizable,
    drag: systemTableConfig.columnDrag,
    minWidth: systemTableConfig.columnMinWidth,
    maxFixedSize: systemTableConfig.maxFixedColumns,
  });
  options.sortConfig = mergeFallbackRecord(options.sortConfig, {
    multiple: systemTableConfig.multipleSort,
    chronological: systemTableConfig.chronologicalSort,
    allowClear: systemTableConfig.allowClearSort,
    trigger: systemTableConfig.sortTrigger,
    showIcon: systemTableConfig.showSortIcon,
  });
  options.filterConfig = mergeFallbackRecord(options.filterConfig, {
    multiple: systemTableConfig.multipleFilter,
    remote: systemTableConfig.remoteFilter,
    showIcon: systemTableConfig.showFilterIcon,
    transfer: systemTableConfig.filterTransfer,
    showFooter: systemTableConfig.showFilterFooter,
  });
  options.tooltipConfig = mergeFallbackRecord(options.tooltipConfig, {
    mode: systemTableConfig.tooltipMode,
    showAll: systemTableConfig.tooltipShowAll,
    enterable: systemTableConfig.tooltipEnterable,
    enterDelay: systemTableConfig.tooltipEnterDelay,
    leaveDelay: systemTableConfig.tooltipLeaveDelay,
    defaultPlacement: systemTableConfig.tooltipPlacement,
  });
  options.virtualXConfig = mergeFallbackRecord(options.virtualXConfig, {
    enabled: systemTableConfig.virtualXEnabled,
    gt: systemTableConfig.virtualXThreshold,
    oSize: systemTableConfig.virtualXOverscan,
    scrollToLeftOnChange: systemTableConfig.scrollToLeftOnChange,
  });
  options.virtualYConfig = mergeFallbackRecord(options.virtualYConfig, {
    enabled: systemTableConfig.virtualYEnabled,
    gt: systemTableConfig.virtualYThreshold,
    oSize: systemTableConfig.virtualYOverscan,
    scrollToTopOnChange: systemTableConfig.scrollToTopOnChange,
  });
  if (isRecord(options.pagerConfig)) {
    options.pagerConfig = mergeFallbackRecord(
      options.pagerConfig,
      resolveSystemPagerConfig(systemTableConfig),
    );
  }

  return options;
}

export function resolveSystemPagerConfig(config: SystemTableConfig) {
  return {
    pageSize: config.pageSize,
    pageSizes: config.pageSizes,
    background: config.pagerBackground,
    autoHidden: config.pagerAutoHidden,
    pagerCount: config.pagerCount,
    layouts: createPagerLayouts(config),
  };
}

function readExplicitHeight(
  primaryConfig: unknown,
  legacyConfig: unknown,
  alias: unknown,
  fallback: unknown,
) {
  const primary = isRecord(primaryConfig) ? primaryConfig.height : undefined;
  const legacy = isRecord(legacyConfig) ? legacyConfig.height : undefined;
  return primary ?? legacy ?? alias ?? fallback;
}

function createPagerLayouts(config: SystemTableConfig) {
  const layouts: SystemPagerLayout[] = ['PrevPage', 'JumpNumber', 'NextPage'];
  if (config.showPageSize === true) layouts.push('Sizes');
  if (config.showPageJump === true) layouts.push('FullJump');
  if (config.showPageTotal === true) layouts.push('Total');
  return layouts;
}

function applyFallback(
  target: Record<string, unknown>,
  key: string,
  fallback: unknown,
) {
  if (typeof target[key] === 'undefined' && typeof fallback !== 'undefined') {
    target[key] = cloneValue(fallback);
  }
}

function mergeFallbackRecord(explicit: unknown, fallback: Record<string, unknown>) {
  const result = isRecord(explicit) ? { ...explicit } : {};
  for (const [key, value] of Object.entries(fallback)) {
    applyFallback(result, key, value);
  }
  return result;
}

function mergeRecords(
  defaults: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  const result = cloneValue(defaults);
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'undefined' || value === null) continue;
    result[key] = isRecord(result[key]) && isRecord(value)
      ? mergeRecords(result[key] as Record<string, unknown>, value)
      : cloneValue(value);
  }
  return result;
}

function cloneValue<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
