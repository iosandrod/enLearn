import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AiAccessService } from './ai-access.service';
import { StartAiRunDto } from './ai.dto';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiRepository } from './ai.repository';
import { AiRunRegistryService, readAiEventSequence } from './ai-run-registry.service';
import type { AiStreamEvent } from './ai.types';
import { PageProposalService } from './proposals/page-proposal.service';

const MAX_AI_CONTEXT_INPUT_BYTES = 96 * 1024;

function assertContextInputSize(body: StartAiRunDto) {
  const bytes = Buffer.byteLength(JSON.stringify({
    pageRef: body.pageRef,
    selection: body.selection,
    clientContext: body.clientContext
  }), 'utf8');
  if (bytes > MAX_AI_CONTEXT_INPUT_BYTES) {
    throw new BadRequestException('AI page context exceeds the 96 KB request limit.');
  }
}

function writeSse(res: Response, event: AiStreamEvent) {
  res.write(`id: ${event.eventId}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

type Response = {
  writableEnded: boolean;
  once(event: 'close', listener: () => void): unknown;
  off(event: 'close', listener: () => void): unknown;
  status(code: number): Response;
  setHeader(name: string, value: string): unknown;
  flushHeaders?: () => void;
  write(chunk: string): unknown;
  end(): unknown;
};

function streamHeaders(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

@Controller('ai')
export class AiController {
  constructor(
    @Inject(AiAccessService) private readonly access: AiAccessService,
    @Inject(AiOrchestratorService) private readonly orchestrator: AiOrchestratorService,
    @Inject(AiRunRegistryService) private readonly runs: AiRunRegistryService,
    @Inject(AiRepository) private readonly repository: AiRepository,
    @Inject(PageProposalService) private readonly proposals: PageProposalService
  ) {}

  @Post('runs/stream')
  async startRun(
    @Body() body: StartAiRunDto,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined,
    @Headers('x-request-id') requestIdHeader: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() _req: unknown,
    @Res() res: Response
  ) {
    assertContextInputSize(body);
    const requestId = requestIdHeader?.trim() || randomUUID();
    const principal = await this.access.authenticate({ authorization, requestId }, accountId);
    const run = await this.orchestrator.start(principal, {
      requestId,
      sessionId: body.sessionId,
      mode: body.mode,
      message: body.message.trim(),
      pageRef: body.pageRef,
      selection: body.selection,
      clientContext: body.clientContext,
      includeSampleData: body.includeSampleData
    });
    streamHeaders(res);
    const unsubscribe = this.runs.subscribe(
      run.id,
      readAiEventSequence(lastEventId),
      (event) => writeSse(res, event)
    );
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };
    res.once('close', close);
    await run.completion;
    res.off('close', close);
    close();
  }

  @Get('runs/:runId/events')
  async resumeRun(
    @Param('runId') runId: string,
    @Query('after') after: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() _req: unknown,
    @Res() res: Response
  ) {
    const principal = await this.access.authenticate({ authorization }, accountId);
    const run = this.runs.get(runId);
    if (run.accountId !== principal.context.accountId || run.userId !== principal.context.userId) {
      throw new ForbiddenException('AI run does not belong to the active account and user.');
    }
    streamHeaders(res);
    const afterSequence = Math.max(readAiEventSequence(lastEventId), Number(after) || 0);
    const unsubscribe = this.runs.subscribe(runId, afterSequence, (event) => writeSse(res, event));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };
    res.once('close', close);
    if (run.status === 'running') await run.completion;
    res.off('close', close);
    close();
  }

  @Post('runs/:runId/cancel')
  @HttpCode(200)
  async cancelRun(
    @Param('runId') runId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined
  ) {
    const principal = await this.access.authenticate({ authorization }, accountId);
    const run = this.runs.get(runId);
    if (run.accountId !== principal.context.accountId || run.userId !== principal.context.userId) {
      throw new ForbiddenException('AI run does not belong to the active account and user.');
    }
    if (run.status === 'running') {
      await this.repository.finishRun({ principal, runId, status: 'cancelled' });
    }
    return { success: true, status: this.runs.cancel(runId).status };
  }

  @Get('conversations')
  async listConversations(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined
  ) {
    const principal = await this.access.authenticate({ authorization }, accountId);
    return this.repository.listConversations(principal);
  }

  @Get('conversations/:conversationId/messages')
  async listMessages(
    @Param('conversationId') conversationId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined
  ) {
    const principal = await this.access.authenticate({ authorization }, accountId);
    return this.repository.listMessages(principal, conversationId);
  }

  @Post('proposals/:proposalId/apply')
  @HttpCode(200)
  async applyProposal(
    @Param('proposalId') proposalId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined
  ) {
    const principal = await this.access.authenticate({ authorization }, accountId, 'ai.page.apply');
    return this.proposals.apply(principal, proposalId);
  }

  @Post('proposals/:proposalId/reject')
  @HttpCode(200)
  async rejectProposal(
    @Param('proposalId') proposalId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-account-id') accountId: string | undefined
  ) {
    const principal = await this.access.authenticate({ authorization }, accountId);
    return this.proposals.reject(principal, proposalId);
  }
}

export const aiControllerInternals = { writeSse, streamHeaders, assertContextInputSize };
