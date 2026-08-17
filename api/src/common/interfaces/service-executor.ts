export interface ServiceContext {
  authorization?: string;
  internal?: {
    principal: 'trigger-workflow';
    capability: string;
  };
  /**
   * 当前统一服务调用的服务名。
   *
   * 领域服务在 Redis 调用场景下需要保留这个字段，基类才能使用
   * serviceName + serviceMethod 查找对应的 Webhook 工作流。
   */
  serviceName?: string;
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
