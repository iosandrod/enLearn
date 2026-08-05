export type VirtualTableAlign = 'left' | 'center' | 'right';

export type VirtualTableFormatter =
  | { type?: 'text'; emptyText?: string }
  | {
      type: 'date' | 'datetime';
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

export type VirtualTableColumn = {
  key: string;
  sourceIndex: number;
  field?: string;
  title: string;
  width: number;
  fixed: 'left' | 'right' | '';
  align: VirtualTableAlign;
  headerAlign: VirtualTableAlign;
  type?: string;
  sortable: boolean;
  formatter?: VirtualTableFormatter | string | ((params: { cellValue: unknown }) => string);
  action?: boolean;
};

export type VirtualRange = {
  start: number;
  end: number;
};

export type ColumnWindow = VirtualRange & {
  offset: number;
  width: number;
};

export type SortDirection = 'asc' | 'desc';

export type SortState = {
  key: string;
  field: string;
  direction: SortDirection;
};

export type RawGridColumn = Record<string, unknown> & {
  field?: string;
  title?: string;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  fixed?: 'left' | 'right' | '';
  align?: VirtualTableAlign | '';
  headerAlign?: VirtualTableAlign | '';
  type?: string;
  sortable?: boolean;
  visible?: boolean;
  formatter?: VirtualTableColumn['formatter'];
  slots?: { default?: string };
};

export type NormalizeColumnsOptions = {
  defaultWidth?: number;
  sequenceWidth?: number;
  actionWidth?: number;
};

export type FitPinnedColumnsOptions = {
  minPinnedWidth?: number;
  leftRatio?: number;
  rightRatio?: number;
};

const DEFAULT_COLUMN_WIDTH = 132;
const DEFAULT_SEQUENCE_WIDTH = 56;
const MIN_COLUMN_WIDTH = 48;
const MAX_COLUMN_WIDTH = 1200;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed || !/^-?\d+(?:\.\d+)?(?:px)?$/i.test(trimmed)) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readPositiveNumber(value: unknown, fallback: number, min = 1, max = 10000) {
  const parsed = finiteNumber(value);
  if (parsed === undefined || parsed <= 0) return fallback;
  return clamp(parsed, min, max);
}

export function resolveColumnWidth(
  column: RawGridColumn,
  defaultWidth = DEFAULT_COLUMN_WIDTH,
) {
  const width = finiteNumber(column.width);
  const minWidth = finiteNumber(column.minWidth);
  const maxWidth = finiteNumber(column.maxWidth);
  const lowerBound = clamp(minWidth ?? MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
  const upperBound = clamp(maxWidth ?? MAX_COLUMN_WIDTH, lowerBound, MAX_COLUMN_WIDTH);
  return clamp(width ?? Math.max(defaultWidth, lowerBound), lowerBound, upperBound);
}

export function normalizeVirtualColumns(
  rawColumns: RawGridColumn[],
  options: NormalizeColumnsOptions = {},
) {
  const defaultWidth = options.defaultWidth ?? DEFAULT_COLUMN_WIDTH;
  const sequenceWidth = options.sequenceWidth ?? DEFAULT_SEQUENCE_WIDTH;
  const actionWidth = options.actionWidth ?? defaultWidth;

  return rawColumns
    .filter((column) => column.visible !== false)
    .map((column, sourceIndex): VirtualTableColumn => {
      const isSequence = column.type === 'seq';
      const isAction = column.slots?.default === 'actions';
      const field = typeof column.field === 'string' && column.field.trim()
        ? column.field.trim()
        : undefined;
      const key = isAction
        ? `__actions_${sourceIndex}`
        : field ?? (isSequence ? `__seq_${sourceIndex}` : `__column_${sourceIndex}`);
      const fallbackWidth = isSequence ? sequenceWidth : isAction ? actionWidth : defaultWidth;
      const fixed = column.fixed === 'left' || column.fixed === 'right'
        ? column.fixed
        : isAction
          ? 'right'
          : isSequence
            ? 'left'
            : '';
      const align = column.align === 'center' || column.align === 'right'
        ? column.align
        : column.align === 'left'
          ? 'left'
          : isSequence
            ? 'center'
            : 'left';
      const headerAlign = column.headerAlign === 'left'
        || column.headerAlign === 'center'
        || column.headerAlign === 'right'
        ? column.headerAlign
        : align;

      return {
        key,
        sourceIndex,
        ...(field ? { field } : {}),
        title: typeof column.title === 'string' ? column.title : '',
        width: resolveColumnWidth(column, fallbackWidth),
        fixed,
        align,
        headerAlign,
        ...(typeof column.type === 'string' ? { type: column.type } : {}),
        sortable: column.sortable === true && Boolean(field),
        ...(column.formatter ? { formatter: column.formatter } : {}),
        ...(isAction ? { action: true } : {}),
      };
    });
}

export function partitionVirtualColumns(columns: VirtualTableColumn[]) {
  return {
    left: columns.filter((column) => column.fixed === 'left'),
    center: columns.filter((column) => !column.fixed),
    right: columns.filter((column) => column.fixed === 'right'),
  };
}

function resizePinnedColumns(columns: VirtualTableColumn[], targetWidth: number, minWidth: number) {
  const totalWidth = sumColumnWidths(columns);
  if (!columns.length || totalWidth <= targetWidth) return;

  const baseWidth = minWidth * columns.length;
  if (baseWidth >= targetWidth) {
    const equalWidth = targetWidth / columns.length;
    columns.forEach((column) => {
      column.width = equalWidth;
    });
    return;
  }

  const distributable = targetWidth - baseWidth;
  const totalFlexibleWidth = columns.reduce(
    (total, column) => total + Math.max(0, column.width - minWidth),
    0,
  );
  columns.forEach((column) => {
    const flexibleWidth = Math.max(0, column.width - minWidth);
    column.width = minWidth + (
      totalFlexibleWidth > 0
        ? distributable * flexibleWidth / totalFlexibleWidth
        : distributable / columns.length
    );
  });
}

function fitPinnedSide(
  columns: VirtualTableColumn[],
  budget: number,
  minWidth: number,
  keepFrom: 'start' | 'end',
) {
  if (!columns.length || budget <= 0) return;

  const maxPinnedCount = Math.max(1, Math.floor(budget / minWidth));
  if (columns.length > maxPinnedCount) {
    const unpinned = keepFrom === 'start'
      ? columns.slice(maxPinnedCount)
      : columns.slice(0, columns.length - maxPinnedCount);
    unpinned.forEach((column) => {
      column.fixed = '';
    });
  }

  const pinned = columns.filter((column) => Boolean(column.fixed));
  resizePinnedColumns(pinned, budget, minWidth);
}

export function fitPinnedColumns(
  columns: VirtualTableColumn[],
  viewportWidth: number,
  options: FitPinnedColumnsOptions = {},
) {
  const fitted = columns.map((column) => ({ ...column }));
  if (viewportWidth <= 0) return fitted;

  const partitions = partitionVirtualColumns(fitted);
  if (!partitions.center.length) return fitted;

  const minPinnedWidth = options.minPinnedWidth ?? 48;
  const hasLeft = partitions.left.length > 0;
  const hasRight = partitions.right.length > 0;
  const leftRatio = options.leftRatio ?? (hasRight ? 0.44 : 0.62);
  const rightRatio = options.rightRatio ?? (hasLeft ? 0.24 : 0.35);

  fitPinnedSide(
    partitions.left,
    Math.min(sumColumnWidths(partitions.left), viewportWidth * leftRatio),
    minPinnedWidth,
    'start',
  );
  fitPinnedSide(
    partitions.right,
    Math.min(sumColumnWidths(partitions.right), viewportWidth * rightRatio),
    minPinnedWidth,
    'end',
  );

  return fitted;
}

export function sumColumnWidths(columns: VirtualTableColumn[]) {
  return columns.reduce((total, column) => total + column.width, 0);
}

export function buildColumnOffsets(columns: VirtualTableColumn[]) {
  const offsets = [0];
  columns.forEach((column) => offsets.push(offsets[offsets.length - 1] + column.width));
  return offsets;
}

function findItemAtOffset(offsets: number[], rawOffset: number) {
  const itemCount = Math.max(0, offsets.length - 1);
  if (!itemCount) return 0;

  const total = offsets[itemCount];
  const offset = clamp(rawOffset, 0, Math.max(0, total - Number.EPSILON));
  let low = 0;
  let high = itemCount - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offset < offsets[middle]) {
      high = middle - 1;
    } else if (offset >= offsets[middle + 1]) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return clamp(low, 0, itemCount - 1);
}

export function getColumnWindow(
  offsets: number[],
  scrollLeft: number,
  viewportWidth: number,
  overscan = 1,
): ColumnWindow {
  const count = Math.max(0, offsets.length - 1);
  if (!count || viewportWidth <= 0) return { start: 0, end: 0, offset: 0, width: 0 };

  const safeOverscan = Math.max(0, Math.floor(overscan));
  const startIndex = findItemAtOffset(offsets, scrollLeft);
  const endIndex = findItemAtOffset(offsets, scrollLeft + Math.max(0, viewportWidth - 1));
  const start = Math.max(0, startIndex - safeOverscan);
  const end = Math.min(count, endIndex + 1 + safeOverscan);

  return {
    start,
    end,
    offset: offsets[start],
    width: offsets[end] - offsets[start],
  };
}

export function getRowWindow(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 4,
): VirtualRange {
  if (rowCount <= 0 || viewportHeight <= 0 || rowHeight <= 0) return { start: 0, end: 0 };

  const safeOverscan = Math.max(0, Math.floor(overscan));
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);

  return {
    start: Math.max(0, firstVisible - safeOverscan),
    end: Math.min(rowCount, firstVisible + visibleCount + safeOverscan),
  };
}

function toDateValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && value.trim()) return new Date(value);
  return null;
}

export function formatVirtualCellValue(value: unknown, formatter?: VirtualTableColumn['formatter']) {
  if (!formatter || typeof formatter === 'string') return value ?? '';
  if (typeof formatter === 'function') return formatter({ cellValue: value });

  if (value === null || value === undefined || value === '') {
    return formatter.emptyText ?? '';
  }

  try {
    switch (formatter.type) {
      case 'text':
        return String(value);
      case 'date': {
        const date = toDateValue(value);
        return date && Number.isFinite(date.getTime())
          ? new Intl.DateTimeFormat(formatter.locale ?? 'zh-CN', formatter.options).format(date)
          : formatter.emptyText ?? String(value);
      }
      case 'datetime': {
        const date = toDateValue(value);
        return date && Number.isFinite(date.getTime())
          ? new Intl.DateTimeFormat(formatter.locale ?? 'zh-CN', {
              dateStyle: 'medium',
              timeStyle: 'short',
              ...formatter.options,
            }).format(date)
          : formatter.emptyText ?? String(value);
      }
      case 'currency': {
        const numericValue = Number(value);
        return Number.isFinite(numericValue)
          ? new Intl.NumberFormat(formatter.locale ?? 'zh-CN', {
              style: 'currency',
              currency: formatter.currency ?? 'CNY',
              ...formatter.options,
            }).format(numericValue)
          : formatter.emptyText ?? String(value);
      }
      case 'number': {
        const numericValue = Number(value);
        return Number.isFinite(numericValue)
          ? new Intl.NumberFormat(formatter.locale ?? 'zh-CN', formatter.options).format(numericValue)
          : formatter.emptyText ?? String(value);
      }
      case 'enum':
        return formatter.map[String(value)] ?? formatter.emptyText ?? String(value);
      default:
        return value ?? '';
    }
  } catch {
    return formatter.emptyText ?? String(value);
  }
}

function compareValues(left: unknown, right: unknown) {
  const leftEmpty = left === null || left === undefined || left === '';
  const rightEmpty = right === null || right === undefined || right === '';
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;

  const leftNumber = typeof left === 'number'
    ? left
    : typeof left === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(left.trim())
      ? Number(left)
      : Number.NaN;
  const rightNumber = typeof right === 'number'
    ? right
    : typeof right === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(right.trim())
      ? Number(right)
      : Number.NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }

  const leftTime = left instanceof Date ? left.getTime() : Number.NaN;
  const rightTime = right instanceof Date ? right.getTime() : Number.NaN;
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime === rightTime ? 0 : leftTime < rightTime ? -1 : 1;
  }

  return String(left).localeCompare(String(right), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortVirtualRows(rows: Record<string, unknown>[], sort: SortState | null) {
  if (!sort) return rows;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = compareValues(left.row[sort.field], right.row[sort.field]);
      if (compared) return sort.direction === 'asc' ? compared : -compared;
      return left.index - right.index;
    })
    .map(({ row }) => row);
}
