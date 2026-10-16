import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DesktopConfig, PrintJob } from './types.js';
import { DEFAULT_CONFIG, mergeConfig } from './validation.js';

export class PersistentStore {
  private configValue: DesktopConfig = structuredClone(DEFAULT_CONFIG);
  private jobsValue: PrintJob[] = [];
  private readonly configFile: string;
  private readonly jobsFile: string;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(directory: string) {
    this.configFile = join(directory, 'config.json');
    this.jobsFile = join(directory, 'jobs.json');
  }

  async initialize() {
    await mkdir(dirname(this.configFile), { recursive: true });
    const config = await readJson(this.configFile);
    if (config) this.configValue = mergeConfig(DEFAULT_CONFIG, config);
    const jobs = await readJson(this.jobsFile);
    if (Array.isArray(jobs)) this.jobsValue = jobs.filter((item): item is PrintJob => Boolean(item && typeof item === 'object' && 'id' in item));
    for (const job of this.jobsValue) {
      if (job.status === 'queued' || job.status === 'printing') {
        job.status = 'failed'; job.error = '客户端上次运行期间退出，任务可能已经输出。请检查系统队列及出纸后，再手动重试。'; job.finishedAt = new Date().toISOString();
      }
    }
    await this.saveJobs();
  }

  get config() { return structuredClone(this.configValue); }
  get jobs() { return structuredClone(this.jobsValue); }

  async updateConfig(value: unknown) {
    this.configValue = mergeConfig(this.configValue, value);
    await this.persist(this.configFile, this.configValue);
    return this.config;
  }

  async putJob(job: PrintJob) {
    const index = this.jobsValue.findIndex((item) => item.id === job.id);
    if (index >= 0) this.jobsValue[index] = structuredClone(job); else this.jobsValue.unshift(structuredClone(job));
    let retained = 0;
    this.jobsValue = this.jobsValue.filter((item) => item.status === 'queued' || item.status === 'printing' || retained++ < this.configValue.maxHistory);
    await this.saveJobs();
  }

  findJob(id: string) { return this.jobsValue.find((item) => item.id === id); }
  private saveJobs() { return this.persist(this.jobsFile, this.jobsValue); }
  private persist(file: string, value: unknown) {
    const snapshot = JSON.stringify(value, null, 2);
    const pending = this.writeTail.then(() => atomicJson(file, snapshot));
    this.writeTail = pending.catch(() => undefined);
    return pending;
  }
}

async function readJson(file: string): Promise<unknown> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error(`无法读取持久化文件 ${file}：${error instanceof Error ? error.message : String(error)}`); }
}

async function atomicJson(file: string, value: unknown) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, value as string, 'utf8');
  await rename(temporary, file);
}
