import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { RequestError } from './template.js';
import type { Configuration } from './config.js';
import type { RenderInput, RenderRequest, RenderResponse, RenderResult } from './types.js';

type Pending = {
  request: RenderRequest;
  resolve: (result: RenderResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  cleanup: () => void;
};
type Slot = {
  worker: Worker;
  ready: boolean;
  retired: boolean;
  browserPid?: number;
  task?: Pending;
};

export class RenderPool {
  private slots: Slot[] = [];
  private queue: Pending[] = [];
  private sequence = 0;
  private closed = false;
  private disposals = new Set<Promise<void>>();

  constructor(private readonly config: Configuration) {}

  async start() {
    try { await Promise.all(Array.from({ length: this.config.workerCount }, () => this.addWorker())); }
    catch (error) { await this.close(); throw error; }
  }

  status() {
    return { workers: this.slots.length, ready: this.slots.filter((slot) => slot.ready).length, busy: this.slots.filter((slot) => slot.task).length, queued: this.queue.length, maxQueue: this.config.maxQueue };
  }

  render(input: RenderInput, signal?: AbortSignal): Promise<RenderResult> {
    if (this.closed) return Promise.reject(new RequestError(503, 'Render pool is closed.'));
    if (signal?.aborted) return Promise.reject(new RequestError(499, 'Request cancelled.'));
    if (this.queue.length >= this.config.maxQueue) return Promise.reject(new RequestError(503, 'Preview queue is full; retry later.'));
    return new Promise((resolve, reject) => {
      const task: Pending = {
        request: { id: String(++this.sequence), input }, resolve, reject,
        timer: setTimeout(() => this.cancel(task, new RequestError(504, 'Preview timed out.')), this.config.timeoutMs),
        cleanup: () => signal?.removeEventListener('abort', abort)
      };
      const abort = () => this.cancel(task, new RequestError(499, 'Request cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(task);
      this.drain();
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const task of this.queue.splice(0)) this.finish(task, new RequestError(503, 'Render pool is shutting down.'));
    for (const slot of [...this.slots]) this.retire(slot, new RequestError(503, 'Render pool is shutting down.'));
    await Promise.all([...this.disposals]);
  }

  private addWorker(): Promise<void> {
    const worker = new Worker(new URL('./renderer.worker.mjs', import.meta.url), {
      workerData: { executablePath: this.config.executablePath, assetOrigins: this.config.assetOrigins, timeoutMs: this.config.timeoutMs }
    });
    const slot: Slot = { worker, ready: false, retired: false };
    this.slots.push(slot);
    return new Promise((resolve, reject) => {
      let started = false;
      const startupTimer = setTimeout(() => fail(new Error('Chromium startup timed out.')), 30_000);
      const fail = (error: Error) => {
        clearTimeout(startupTimer);
        if (!started) reject(error);
        this.retire(slot, error);
      };
      worker.on('message', (message: RenderResponse) => {
        if (message.type === 'browser') { slot.browserPid = message.pid; return; }
        if (message.type === 'ready') {
          clearTimeout(startupTimer);
          if (slot.retired) return;
          started = true;
          slot.ready = true;
          resolve();
          this.drain();
          return;
        }
        if (message.type === 'fatal') { fail(new Error(message.message)); return; }
        const task = slot.task;
        if (!task || task.request.id !== message.id || slot.retired) return;
        slot.task = undefined;
        if (message.type === 'result') this.finish(task, undefined, message.result);
        else this.finish(task, new RequestError(message.statusCode, message.message));
        this.drain();
      });
      worker.once('error', fail);
      worker.once('exit', (code) => {
        clearTimeout(startupTimer);
        if (!started) reject(new Error(`Renderer exited during startup (${code}).`));
        if (!slot.retired) this.retire(slot, new Error(`Renderer exited (${code}).`));
      });
    });
  }

  private drain() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.ready || slot.task || slot.retired) continue;
      const task = this.queue.shift();
      if (!task) return;
      slot.task = task;
      try { slot.worker.postMessage(task.request); }
      catch (error) { this.retire(slot, error as Error); }
    }
  }

  private finish(task: Pending, error?: Error, result?: RenderResult) {
    clearTimeout(task.timer);
    task.cleanup();
    if (error) task.reject(error);
    else task.resolve(result!);
  }

  private cancel(task: Pending, error: Error) {
    const slot = this.slots.find((candidate) => candidate.task === task);
    if (slot) this.retire(slot, error);
    else {
      const index = this.queue.indexOf(task);
      if (index < 0) return;
      this.queue.splice(index, 1);
      this.finish(task, error);
    }
  }

  private retire(slot: Slot, error: Error) {
    if (slot.retired) return;
    slot.retired = true;
    this.slots = this.slots.filter((candidate) => candidate !== slot);
    if (slot.task) { this.finish(slot.task, error); slot.task = undefined; }
    // A terminated worker cannot close its browser. Kill its dedicated process tree too.
    const disposal = (async () => {
      await slot.worker.terminate();
      if (slot.browserPid) await killBrowser(slot.browserPid);
      if (!this.closed && slot.ready) {
        try { await this.addWorker(); }
        catch (replacementError) {
          console.error('[api-print] worker replacement failed:', replacementError);
          for (const task of this.queue.splice(0)) this.finish(task, new RequestError(503, 'Renderer unavailable.'));
        }
      }
    })();
    this.disposals.add(disposal);
    void disposal.finally(() => this.disposals.delete(disposal));
  }
}

async function killBrowser(pid: number) {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.once('error', () => resolve());
      child.once('exit', () => resolve());
    });
  } else {
    try { process.kill(-pid, 'SIGKILL'); }
    catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already stopped */ } }
  }
}
