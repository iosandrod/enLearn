import type { LowCodePageSchema } from './lowcode.schema';

export type LowCodePageRow = {
  id: string;
  code: string;
  route: string;
  title: string;
  description: string | null;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  page_type: 'list' | 'edit' | 'detail' | 'custom';
  edit_page_id: string | null;
  view_name: string | null;
  table_name: string | null;
  relate_config: Record<string, unknown>;
  schema: LowCodePageSchema;
  node_actions?: Array<Record<string, unknown>>;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
