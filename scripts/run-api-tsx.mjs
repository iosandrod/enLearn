import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const apiDir = resolve(repoRoot, 'api');
const tsxCli = resolve(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

if (!existsSync(tsxCli)) {
  console.error(`Unable to locate api tsx CLI: ${tsxCli}`);
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCli, ...process.argv.slice(2)], {
  cwd: apiDir,
  // Keep the Node executable selected by the parent pnpm process. This is
  // required for Node 22's WebSocket support used by the Trigger.dev worker.
  env: { ...process.env, PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` },
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    child.kill(signal);
  });
}

child.once('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
  process.exit(code ?? 0);
});
