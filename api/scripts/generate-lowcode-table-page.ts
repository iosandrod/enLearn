import { withPostgresClient } from '../src/common/utils/database';
import { buildTableListPageSchemaFromDatabase } from '../src/lowcode/table-page-generator';

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

  await withPostgresClient(async (client) => {
    const schema = await buildTableListPageSchemaFromDatabase(client, {
      tableName: args.tableName,
      code: args.code,
      route: args.route,
      title: args.title,
      ...(args.description ? { description: args.description } : {}),
      status: 'published'
    });

    await client.query('begin');

    try {
      const existing = await client.query<{ id: string; version: number }>(
        'select id, version from public.lowcode_pages where code = $1 for update',
        [schema.code]
      );
      const nextVersion = Number(existing.rows[0]?.version ?? 0) + 1;
      const now = new Date();

      const saved = await client.query<{ id: string; version: number }>(
        `
          insert into public.lowcode_pages (
            code,
            route,
            title,
            description,
            layout,
            status,
            keep_alive,
            schema,
            version,
            published_at,
            updated_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $10
          )
          on conflict (code) do update set
            route = excluded.route,
            title = excluded.title,
            description = excluded.description,
            layout = excluded.layout,
            status = excluded.status,
            keep_alive = excluded.keep_alive,
            schema = excluded.schema,
            version = excluded.version,
            published_at = excluded.published_at,
            updated_at = excluded.updated_at
          returning id, version
        `,
        [
          schema.code,
          schema.route,
          schema.title,
          schema.description ?? null,
          schema.layout ?? 'dashboard',
          schema.status ?? 'published',
          schema.keepAlive !== false,
          JSON.stringify(schema),
          nextVersion,
          now
        ]
      );

      await client.query(
        `
          insert into public.lowcode_page_versions (
            page_id,
            version,
            schema,
            published_at,
            created_at
          ) values ($1, $2, $3::jsonb, $4, $4)
          on conflict (page_id, version) do update set
            schema = excluded.schema,
            published_at = excluded.published_at
        `,
        [saved.rows[0].id, saved.rows[0].version, JSON.stringify(schema), now]
      );

      await client.query('commit');

      console.log(
        JSON.stringify(
          {
            code: schema.code,
            route: schema.route,
            tableName: args.tableName,
            version: saved.rows[0].version,
            blocks: schema.blocks.map((block) => `${block.id}:${block.kind}`)
          },
          null,
          2
        )
      );
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
