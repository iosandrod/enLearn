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
  schema: LowCodePageSchema;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LowCodePageOpenType = 'page' | 'drawer' | 'modal';

export type LowCodePageRelationPageRow = {
  id: string;
  code: string;
  route: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
};

export type LowCodePageRelation = {
  id?: string;
  sourcePageId: string;
  sourcePageCode: string;
  sourcePageRoute?: string;
  sourcePageTitle?: string;
  actionKey: string;
  targetPageId: string;
  targetPageCode: string;
  targetPageRoute?: string;
  targetPageTitle?: string;
  openType: LowCodePageOpenType;
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type LowCodePageRelations = {
  outgoing: LowCodePageRelation[];
  incoming: LowCodePageRelation[];
};

export type LowCodePageRelationInput = {
  sourcePageCode?: string;
  targetPageCode?: string;
  actionKey?: string;
  openType?: LowCodePageOpenType;
  metadata?: Record<string, unknown>;
};
