import pg from './api/node_modules/pg/lib/index.js';
import fs from 'node:fs';
const line = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find((x) => x.startsWith('DIRECT_URL='));
const connectionString = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '').replace('&uselibpqcompat=true','');
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const result = await client.query(`select id, name, status, version from public.print_templates order by updated_at desc limit 20`);
console.log(JSON.stringify(result.rows, null, 2));
await client.end();
