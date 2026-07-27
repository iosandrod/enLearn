export type WorkflowModelStatus = 'draft' | 'published' | 'disabled' | 'archived';

export type WorkflowDefinitionStatus = 'active' | 'disabled' | 'archived';

export type WorkflowModelRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  documentType?: string;
  status: WorkflowModelStatus;
  currentVersion: number;
  draftSchema: Record<string, unknown>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowModelVersionRecord = {
  id: string;
  modelId: string;
  version: number;
  schema: Record<string, unknown>;
  remark?: string;
  createdBy?: string;
  createdAt: string;
};

export type WorkflowProcessDefinitionRecord = {
  id: string;
  tenantId: string;
  modelId: string;
  modelVersionId: string;
  code: string;
  name: string;
  version: number;
  documentType?: string;
  schema: Record<string, unknown>;
  status: WorkflowDefinitionStatus;
  publishedBy?: string;
  publishedAt: string;
};

export type WorkflowRequestActor = {
  tenantId: string;
  userId?: string;
};
