export interface ServiceContext {
  authorization?: string;
  requestId?: string;
  userId?: string;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
  accountRole?: 'owner' | 'member';
}

export interface ServiceExecutor {
  execute(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ): Promise<unknown>;
}
