import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ok } from '../common/api-response';
import {
  AddSignTaskDto,
  CompleteTaskDto,
  RejectTaskDto,
  TransferTaskDto,
  type WorkflowCcQuery,
  type WorkflowTaskQuery
} from '../runtime/runtime.dto';
import { RuntimeService } from '../runtime/runtime.service';

@Controller('tasks')
export class TaskController {
  constructor(@Inject(RuntimeService) private readonly runtimeService: RuntimeService) {}

  @Get('todo')
  async listTodo(@Query() query: WorkflowTaskQuery, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.listTodoTasks(resolveActor(request), query));
  }

  @Get('done')
  async listDone(@Query() query: WorkflowTaskQuery, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.listDoneTasks(resolveActor(request), query));
  }

  @Get('cc')
  async listCc(@Query() query: WorkflowCcQuery, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.listCc(resolveActor(request), query));
  }

  @Get('started')
  async listStarted(@Req() request: HeaderReader) {
    return ok(await this.runtimeService.listStarted(resolveActor(request)));
  }

  @Get(':taskId')
  async getTask(@Param('taskId') taskId: string) {
    return ok(await this.runtimeService.getTask(taskId));
  }

  @Post(':taskId/approve')
  async approveTask(
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTaskDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.runtimeService.completeTask(taskId, dto, resolveActor(request)));
  }

  @Post(':taskId/claim')
  async claimTask(@Param('taskId') taskId: string, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.claimTask(taskId, resolveActor(request)));
  }

  @Post(':taskId/reject')
  async rejectTask(
    @Param('taskId') taskId: string,
    @Body() dto: RejectTaskDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.runtimeService.rejectTask(taskId, dto, resolveActor(request)));
  }

  @Post(':taskId/transfer')
  async transferTask(
    @Param('taskId') taskId: string,
    @Body() dto: TransferTaskDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.runtimeService.transferTask(taskId, dto, resolveActor(request)));
  }

  @Post(':taskId/add-sign')
  async addSignTask(
    @Param('taskId') taskId: string,
    @Body() dto: AddSignTaskDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.runtimeService.addSignTask(taskId, dto, resolveActor(request)));
  }
}

type HeaderReader = {
  header(name: string): string | undefined;
};

function resolveActor(request: HeaderReader) {
  const tenantId = request.header('x-tenant-id')?.trim() || 'default';
  const userId = request.header('x-user-id')?.trim();
  return {
    tenantId,
    ...(userId ? { userId } : {})
  };
}
