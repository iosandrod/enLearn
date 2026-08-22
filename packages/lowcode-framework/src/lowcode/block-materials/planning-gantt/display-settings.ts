export type GanttGranularity = 'auto' | 'hour' | 'day' | 'week' | 'month';

export type GanttDisplaySettingsModel = {
  start: string;
  end: string;
  granularity: GanttGranularity;
  cellWidth: number | null;
  gridWidth: number | null;
};

export type GanttDisplaySettingsDefaults = {
  start: string;
  end: string;
  granularity: GanttGranularity;
  cellWidth: number;
  gridWidth: number;
};

export type GanttDisplaySettingsField = {
  key: keyof GanttDisplaySettingsModel;
  label: string;
  control: 'datetime-local' | 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
};

export const DEFAULT_GANTT_DISPLAY_SETTINGS: GanttDisplaySettingsModel = {
  start: '',
  end: '',
  granularity: 'auto',
  cellWidth: null,
  gridWidth: null,
};

export const GANTT_DISPLAY_FIELDS: GanttDisplaySettingsField[] = [
  { key: 'start', label: '开始时间', control: 'datetime-local' },
  { key: 'end', label: '结束时间', control: 'datetime-local' },
  {
    key: 'granularity',
    label: '日期粒度',
    control: 'select',
    options: [
      { label: '自动', value: 'auto' },
      { label: '小时', value: 'hour' },
      { label: '天', value: 'day' },
      { label: '周', value: 'week' },
      { label: '月', value: 'month' },
    ],
  },
  { key: 'cellWidth', label: '时间格宽度', control: 'number', min: 40, max: 160, step: 4 },
  { key: 'gridWidth', label: '左侧列宽', control: 'number', min: 176, max: 420, step: 8 },
];
