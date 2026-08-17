import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AiContextService } from '../ai-context.service';
import { AI_SERVICE_ROUTER, type AiServiceRouter } from '../ai-service-router';
import type { AiToolContext, AiToolDefinition } from '../ai.types';
import { PageProposalService } from '../proposals/page-proposal.service';

type AiToolHandler = (
  context: AiToolContext,
  args: Record<string, unknown>
) => Promise<unknown> | unknown;

type RegisteredAiTool = {
  definition: AiToolDefinition;
  modes?: AiToolContext['mode'][];
  handler: AiToolHandler;
};

const objectParameters = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {})
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRows(value: unknown) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows;
  return [];
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function assertAllowedTable(
  router: AiServiceRouter,
  context: AiToolContext,
  tableName: unknown
) {
  const requested = readString(tableName);
  const rows = readRows(await router.invoke(
    'lowcode',
    'listTablePageOptions',
    {},
    context.principal.context
  ));
  const allowed = rows.some((row) => isRecord(row) &&
    [row.value, row.tableName].some((value) => readString(value) === requested));
  if (!requested || !allowed) {
    throw new BadRequestException('Selected table is not available to the current page manager.');
  }
  return requested;
}

function limitToolResult(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, 16_000);
  if (Array.isArray(value)) return value.slice(0, 100).map(limitToolResult);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).slice(0, 200).map(([key, item]) => [key, limitToolResult(item)])
  );
}

function summarizeTableOptions(value: unknown) {
  return readRows(value).slice(0, 100).flatMap((row) => {
    if (!isRecord(row)) return [];
    const tableName = readString(row.value ?? row.tableName);
    if (!tableName) return [];
    return [{
      value: tableName,
      title: readString(row.title ?? row.label)
    }];
  });
}

@Injectable()
export class AiToolRegistry {
  private readonly tools = new Map<string, RegisteredAiTool>();

  constructor(
    @Inject(AI_SERVICE_ROUTER) private readonly router: AiServiceRouter,
    @Inject(AiContextService) private readonly contextService: AiContextService,
    @Inject(PageProposalService) private readonly proposals: PageProposalService
  ) {
    this.registerDefaults();
  }

  definitions(mode: AiToolContext['mode']) {
    return [...this.tools.values()]
      .filter((tool) => !tool.modes || tool.modes.includes(mode))
      .map((tool) => tool.definition);
  }

  async execute(name: string, context: AiToolContext, args: Record<string, unknown>) {
    const tool = this.tools.get(name);
    if (!tool || (tool.modes && !tool.modes.includes(context.mode))) {
      throw new BadRequestException(`AI tool "${name}" is not available in this mode.`);
    }
    return limitToolResult(await tool.handler(context, args));
  }

  private register(tool: RegisteredAiTool) {
    this.tools.set(tool.definition.name, tool);
  }

  private registerDefaults() {
    this.register({
      definition: {
        name: 'current_page.describe',
        description: 'Return the already-authorized, redacted current-page context.',
        parameters: objectParameters({})
      },
      handler: (context) => context.pageContext
    });

    this.register({
      definition: {
        name: 'lowcode.list_table_options',
        description: 'List database tables available to the current low-code page manager.',
        parameters: objectParameters({})
      },
      modes: ['create_page'],
      handler: async (context) => summarizeTableOptions(await this.router.invoke(
        'lowcode',
        'listTablePageOptions',
        {},
        context.principal.context
      ))
    });

    this.register({
      definition: {
        name: 'lowcode.inspect_table',
        description: 'Inspect the allowed columns of one database table. The table must come from list_table_options.',
        parameters: objectParameters({ tableName: { type: 'string', maxLength: 160 } }, ['tableName'])
      },
      modes: ['create_page'],
      handler: async (context, args) => this.router.invoke(
        'lowcode',
        'listTableColumns',
        { tableName: await assertAllowedTable(this.router, context, args.tableName) },
        context.principal.context
      )
    });

    this.register({
      definition: {
        name: 'proposal.create_page',
        description: 'Create a validated draft page proposal from an allowed database table. This never saves the page.',
        parameters: objectParameters({
          tableName: { type: 'string', maxLength: 160 },
          code: { type: 'string', maxLength: 160 },
          route: { type: 'string', maxLength: 500 },
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 800 }
        }, ['tableName', 'code', 'route', 'title'])
      },
      modes: ['create_page'],
      handler: (context, args) => this.proposals.createTablePage(context, args)
    });

    this.register({
      definition: {
        name: 'proposal.patch_page',
        description: 'Create a stable-id patch proposal for the current page. This never saves the page. For grid presentation use updateGridColumn (change title or width) or upsertGridColumn (add or move a field after another field). To create a reusable built-in page function, use upsertPageFunction with builtinFunction. To bind an existing top-level button to that function, put bindButtonToPageFunction after the function operation. Never include raw scripts, direct service calls, or SQL.',
        parameters: objectParameters({
          summary: { type: 'string', maxLength: 500 },
          operations: {
            type: 'array',
            maxItems: 50,
            items: { type: 'object' }
          }
        }, ['summary', 'operations'])
      },
      modes: ['edit_page'],
      handler: (context, args) => this.proposals.patchPage(context, args)
    });

    this.register({
      definition: {
        name: 'proposal.create_button',
        description: 'Create a proposal for a button using a built-in page function when possible.',
        parameters: objectParameters({
          blockId: { type: 'string', maxLength: 160 },
          builtinKey: {
            type: 'string',
            enum: [
              'record.create', 'record.copy', 'record.edit', 'record.modify', 'record.save',
              'record.approve', 'record.unapprove', 'record.close', 'record.open',
              'page.refresh', 'print.page', 'page.exit'
            ]
          },
          code: { type: 'string', maxLength: 160 },
          label: { type: 'string', maxLength: 80 },
          summary: { type: 'string', maxLength: 500 }
        }, ['builtinKey'])
      },
      modes: ['generate_button'],
      handler: (context, args) => this.proposals.createButton(context, args)
    });

    this.register({
      definition: {
        name: 'proposal.create_page_function',
        description: 'Create a statically checked QuickJS page-function proposal. This never executes the function.',
        parameters: objectParameters({
          name: { type: 'string', maxLength: 100 },
          label: { type: 'string', maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          builtinFunction: {
            type: 'string',
            enum: ['create', 'copy', 'edit', 'modify', 'save', 'approve', 'unapprove', 'close', 'open', 'refresh', 'print', 'exit']
          }
        }, ['name', 'builtinFunction'])
      },
      modes: ['generate_function'],
      handler: (context, args) => this.proposals.createPageFunction(context, args)
    });
  }
}

export const aiToolRegistryInternals = {
  limitToolResult,
  summarizeTableOptions,
  assertAllowedTable
};
