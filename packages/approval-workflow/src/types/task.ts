export type ApprovalTaskStatus = 'pending' | 'claimed' | 'completed' | 'canceled';

export type ApprovalTask = {
  id: string;
  title: string;
  nodeId: string;
  nodeName: string;
  status: ApprovalTaskStatus;
  assigneeId?: string;
  candidateNames?: string[];
  createdAt?: string;
  dueAt?: string;
};

export type ApprovalTimelineEvent = {
  id: string;
  eventType: string;
  title: string;
  operatorName?: string;
  comment?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
};
