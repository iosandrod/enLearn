import { createWriteStream, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';
import { getEnv } from '../../common/utils/env';
import { buildFreppleInput } from './frepple-input.builder';
import { PlanningDataLoader } from './planning-data-loader';
import { createPlanningEngine } from './planning-engine';
import {
  isPlanningCanceled,
  PlanningCanceledError,
  PlanningPreflightError,
  type PlanningEngine,
  type PlanningRunOutput,
  type PlanningRunRequest
} from './planning-execution.types';
import { resolvePlanningParameters } from './planning-parameters';
import { preflightPlanningData } from './planning-preflight';
import { PlanningResultWriter, resultSummary } from './planning-result.writer';
import { PlanningRunRepository } from './planning-run.repository';
import { normalizePlanningSnapshotForEngine } from './planning-snapshot-normalizer';

export class PlanningOrchestrator {
  private readonly repository: PlanningRunRepository;
  private readonly writer: PlanningResultWriter;

  constructor(
    private readonly pool: Pool,
    private readonly loader = new PlanningDataLoader(pool),
    private readonly engine: PlanningEngine = createPlanningEngine()
  ) {
    this.repository = new PlanningRunRepository(pool);
    this.writer = new PlanningResultWriter(pool);
  }

  async run(request: PlanningRunRequest & {
    attempt?: number;
    triggerRunId?: string;
  }): Promise<PlanningRunOutput> {
    const state = await this.repository.start({
      accountId: request.accountId,
      attempt: request.attempt,
      planVersionId: request.planVersionId,
      runId: request.runId,
      triggerRunId: request.triggerRunId
    });
    if (state.runStatus === 'succeeded' && state.output) return state.output;
    if (state.runStatus === 'succeeded') {
      throw new Error('Planning run has already succeeded without a persisted output summary.');
    }
    if (state.runStatus === 'failed') throw new Error('Planning run has already failed.');
    const planVersionId = state.planVersionId;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    request.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (request.signal?.aborted) controller.abort();
    const cancellationPoll = setInterval(() => {
      void this.repository.assertNotCanceled(request.accountId, request.runId)
        .catch((error) => {
          if (isPlanningCanceled(error)) controller.abort();
        });
    }, 2_000);
    cancellationPoll.unref?.();
    const log = createPlanningLog(request.runId);

    const progress = async (value: number, message: string, extra: {
      processId?: number;
    } = {}) => {
      if (controller.signal.aborted) throw new PlanningCanceledError();
      await this.repository.progress(request.accountId, request.runId, {
        logfile: log.path,
        message,
        processId: extra.processId,
        progress: value
      });
      await request.onProgress?.({
        logfile: log.path,
        message,
        processId: extra.processId,
        progress: value
      });
    };

    try {
      await progress(8, '正在读取一致性数据快照');
      const loadedSnapshot = await this.loader.load(request.accountId);
      const normalization = normalizePlanningSnapshotForEngine(loadedSnapshot);
      const snapshot = normalization.snapshot;
      if (normalization.addedBuffers.length) {
        await progress(
          16,
          `已为本地排产输入补齐 ${normalization.addedBuffers.length} 个零库存物料缓冲`
        );
      }
      await progress(20, '正在校验计划数据完整性');
      const preflight = preflightPlanningData(snapshot);
      if (!preflight.ok) throw new PlanningPreflightError(preflight);
      const parameters = resolvePlanningParameters(snapshot, request.overrides);
      const input = buildFreppleInput(snapshot, parameters);
      await progress(35, `正在调用${engineDisplayName(this.engine.mode)}排产算法`);
      const result = await this.engine.solve(input.request, {
        onLog: (line) => log.write(line),
        onProcess: (processId) => progress(
          40,
          `${engineDisplayName(this.engine.mode)}排产进程已启动`,
          { processId }
        ),
        signal: controller.signal
      });
      await progress(78, '正在校验并写入计划结果');
      await this.repository.assertNotCanceled(request.accountId, request.runId);
      const summary = resultSummary(result);
      const output: PlanningRunOutput = {
        ...summary,
        inputSnapshot: {
          counts: snapshot.counts,
          hash: snapshot.hash,
          loadedAt: snapshot.loadedAt
        },
        parameters,
        preflight
      };
      await progress(94, '正在原子提交计划结果和版本');
      return await this.writer.complete({
        accountId: request.accountId,
        names: input.names,
        output: {
          inputSnapshot: output.inputSnapshot,
          parameters: output.parameters,
          preflight: output.preflight
        },
        planVersionId,
        references: input.references,
        result,
        runId: request.runId
      });
    } catch (error) {
      if (controller.signal.aborted || isPlanningCanceled(error)) {
        await this.repository.finishCanceled(
          request.accountId,
          request.runId,
          planVersionId
        ).catch(() => undefined);
        throw new PlanningCanceledError();
      }
      await this.repository.progress(request.accountId, request.runId, {
        logfile: log.path,
        message: error instanceof Error ? error.message.slice(0, 4_000) : String(error),
        progress: 99
      }).catch(() => undefined);
      throw error;
    } finally {
      clearInterval(cancellationPoll);
      request.signal?.removeEventListener('abort', forwardAbort);
      log.close();
    }
  }
}

function engineDisplayName(mode: PlanningEngine['mode']) {
  return mode === 'cpp-typescript' ? '本地 cpp-typescript ' : mode === 'http' ? '远程 ' : 'frePPLe ';
}

export async function markPlanningRunFailed(options: {
  accountId: string;
  error: unknown;
  planVersionId?: string;
  pool: Pool;
  runId: string;
}) {
  await new PlanningRunRepository(options.pool).finishFailed(
    options.accountId,
    options.runId,
    options.planVersionId,
    options.error instanceof Error ? options.error.message : String(options.error)
  );
}

function createPlanningLog(runId: string) {
  const env = getEnv();
  const directory = resolve(env.PLANNING_LOG_DIR?.trim() || join(tmpdir(), 'enlearn-planning-logs'));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${runId.replace(/[^a-zA-Z0-9-]/g, '_')}.log`);
  const stream = createWriteStream(path, { flags: 'a', encoding: 'utf8' });
  let closed = false;
  return {
    path,
    write(line: string) {
      if (!closed) stream.write(`${line}\n`);
    },
    close() {
      if (!closed) {
        closed = true;
        stream.end();
      }
    }
  };
}
