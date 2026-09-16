const PAGE_GRID_CONTEXT_MENU_CLASS = 'lc-page-grid-header-context-menu';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createPageGridHeaderMenuOptions() {
  return [
    [
      {
        code: 'tableInfoDesign',
        name: '表格信息设计',
        prefixIcon: 'ri-table-line',
      },
      {
        code: 'designCurrentField',
        name: '设计当前字段',
        prefixIcon: 'ri-edit-box-line',
      },
    ],
    [
      {
        code: 'openSearch',
        name: '打开搜索框',
        prefixIcon: 'ri-search-line',
      },
      {
        code: 'associateEntityField',
        name: '关联实体字段',
        prefixIcon: 'ri-links-line',
      },
    ],
  ];
}

function createPageGridBodyMenuOptions() {
  return [
    [
      {
        code: 'copyCellValue',
        name: '复制',
        prefixIcon: 'ri-file-copy-line',
      },
    ],
    [
      {
        code: 'editCurrentRow',
        name: '编辑当前行',
        prefixIcon: 'ri-edit-line',
      },
      {
        code: 'downloadCurrentRowAttachments',
        name: '下载当前行附件',
        prefixIcon: 'ri-download-2-line',
      },
      {
        code: 'exportData',
        name: '导出数据',
        prefixIcon: 'ri-file-excel-2-line',
      },
    ],
  ];
}

function ensureExportMenuOption(options: unknown) {
  const groups = Array.isArray(options) ? options : [];
  const flattened = groups.flatMap((group) => Array.isArray(group) ? group : []);
  if (flattened.some((item) => isRecord(item) && item.code === 'exportData')) return groups;
  return [...groups, [{ code: 'exportData', name: '导出数据', prefixIcon: 'ri-file-excel-2-line' }]];
}

export function createPageGridMenuConfig(value: unknown) {
  const menuConfig = isRecord(value) ? value : {};
  const headerConfig = isRecord(menuConfig.header) ? menuConfig.header : {};
  const bodyConfig = isRecord(menuConfig.body) ? menuConfig.body : {};
  const configuredClassName =
    typeof menuConfig.className === 'string' ? menuConfig.className.trim() : '';

  return {
    enabled: true,
    trigger: 'cell',
    transfer: true,
    width: 196,
    ...menuConfig,
    className: [PAGE_GRID_CONTEXT_MENU_CLASS, configuredClassName].filter(Boolean).join(' '),
    header: {
      ...headerConfig,
      options: ensureExportMenuOption(
        Array.isArray(headerConfig.options)
          ? headerConfig.options
          : createPageGridHeaderMenuOptions(),
      ),
    },
    body: {
      ...bodyConfig,
      options: ensureExportMenuOption(
        Array.isArray(bodyConfig.options)
          ? bodyConfig.options
          : createPageGridBodyMenuOptions(),
      ),
    },
  };
}
