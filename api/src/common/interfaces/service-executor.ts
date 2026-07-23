export interface ServiceContext {
  authorization?: string;
  requestId?: string;
}

export interface ServiceExecutor {
  execute(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ): Promise<unknown>;
}
