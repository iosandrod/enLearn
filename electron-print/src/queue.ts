import { randomUUID } from 'node:crypto';
import type { PrintJob, PrintRequest } from './types.js';
import type { PrinterEngine } from './printer-engine.js';
import { PersistentStore } from './store.js';
import { Logger } from './logger.js';

type Pending = { job: PrintJob; resolve: (job: PrintJob) => void };

export class PrintQueue {
  private readonly pending: Pending[] = [];
  private running = false;
  private reservations = 0;
  private accepting = true;
  private readonly idleWaiters: Array<() => void> = [];

  constructor(private readonly engine: Pick<PrinterEngine, 'print'>, private readonly store: PersistentStore, private readonly logger: Logger) {}

  get status() { return { running: this.running, queued: this.pending.length }; }

  async enqueue(request: PrintRequest, attempt = 1) {
    if (!this.accepting) throw Object.assign(new Error('客户端正在退出，请稍后重新提交。'), { statusCode: 503 });
    if (this.pending.length + this.reservations >= 100) throw Object.assign(new Error('打印队列已满，请稍后重试。'), { statusCode: 503 });
    this.reservations++;
    let resolve!: (job: PrintJob) => void;
    const completion = new Promise<PrintJob>((done) => { resolve = done; });
    const job: PrintJob = {
      id: randomUUID(), createdAt: new Date().toISOString(), status: 'queued',
      printerName: request.printerName, templateName: request.templateName, jobName: request.jobName,
      copies: request.copies, page: request.page, attempt, request
    };
    try { await this.store.putJob(job); } finally { this.reservations--; }
    this.pending.push({ job, resolve });
    this.logger.info('打印任务进入队列', { id: job.id, printer: job.printerName, template: job.templateName, copies: job.copies });
    void this.drain().catch((error) => this.logger.error('队列持久化异常', String(error)));
    return { job: structuredClone(job), completion };
  }

  stopAccepting() { this.accepting = false; }
  whenIdle() {
    return this.running || this.pending.length ? new Promise<void>((resolve) => this.idleWaiters.push(resolve)) : Promise.resolve();
  }

  async retry(id: string) {
    const existing = this.store.findJob(id);
    if (!existing) throw Object.assign(new Error('找不到打印任务。'), { statusCode: 404 });
    if (existing.status !== 'failed') throw Object.assign(new Error('只有失败任务可以重试。'), { statusCode: 409 });
    return this.enqueue(existing.request, existing.attempt + 1);
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const current = this.pending.shift()!;
        const job = current.job;
        job.status = 'printing'; job.startedAt = new Date().toISOString(); delete job.error;
        try {
          await this.store.putJob(job);
          const result = await this.engine.print(job.request);
          if (!result.success) throw new Error(result.failureReason || '操作系统拒绝了打印任务。');
          job.status = 'submitted';
          await this.logger.info('打印任务已提交系统队列', { id: job.id, printer: job.printerName });
        } catch (error) {
          job.status = 'failed'; job.error = error instanceof Error ? error.message : String(error);
          await this.logger.error('打印任务失败', { id: job.id, printer: job.printerName, error: job.error });
        }
        job.finishedAt = new Date().toISOString();
        await this.store.putJob(job).catch(async (error) => {
          job.status = 'failed'; job.error = `任务记录写入失败，打印结果请检查系统队列：${String(error)}`;
          await this.logger.error('无法保存打印结果', { id: job.id, error: String(error) });
        });
        current.resolve(structuredClone(job));
      }
    } finally { this.running = false; for (const done of this.idleWaiters.splice(0)) done(); }
  }
}
