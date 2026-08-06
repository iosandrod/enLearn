import { createSupabaseClient } from '../src/common/utils/supabase';
import {
  buildTableListPageSchemaFromMetadata,
  readTableRef
} from '../src/lowcode-service/table-page-generator';

type Args = {
  tableName: string;
  code: string;
  route: string;
  title: string;
  description?: string;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value?.slice(prefix.length).trim();
}

function readArgs(): Args {
  return {
    tableName: readArg('table') || readArg('tableName') || 'public.system_option_sources',
    code: readArg('code') || 'admin-system-options',
    route: readArg('route') || '/dashboard/system/options',
    title: readArg('title') || '\u4e0b\u62c9\u6570\u636e',
    description: readArg('description')
  };
}

async function main() {
  const args = readArgs();
  const client = createSupabaseClient('admin');
  const table = readTableRef(args.tableName);
  const { data: metadata, error: metadataError } = await client.rpc(
    'read_lowcode_table_metadata',
    {
      p_action: 'inspect_table',
      p_payload: { schema_name: table.schema, table_name: table.name }
    }
  );
  if (metadataError) throw new Error(metadataError.message);

  const schema = buildTableListPageSchemaFromMetadata(metadata, {
    tableName: args.tableName,
    code: args.code,
    route: args.route,
    title: args.title,
    ...(args.description ? { description: args.description } : {}),
    status: 'published'
  });
  const { data: saved, error: saveError } = await client.rpc('save_generated_lowcode_page', {
    p_payload: {
      code: schema.code,
      route: schema.route,
      title: schema.title,
      description: schema.description ?? null,
      layout: schema.layout ?? 'dashboard',
      status: schema.status ?? 'published',
      keep_alive: schema.keepAlive !== false,
      page_type: schema.pageType ?? 'custom',
      schema
    }
  });
  if (saveError) throw new Error(saveError.message);

  console.log(JSON.stringify({
    code: schema.code,
    route: schema.route,
    tableName: args.tableName,
    version: (saved as Record<string, unknown> | null)?.version,
    blocks: schema.blocks.map((block) => `${block.id}:${block.kind}`)
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
