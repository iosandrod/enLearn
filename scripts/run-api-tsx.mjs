import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const apiDir = resolve(repoRoot, 'api');
const tsxCli = resolve(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const args = process.argv.slice(2);
let envFile;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--env-file') {
    envFile = args[index + 1];
    args.splice(index, 2);
    break;
  }
  if (arg.startsWith('--env-file=')) {
    envFile = arg.slice('--env-file='.length);
    args.splice(index, 1);
    break;
  }
}

if (!existsSync(tsxCli)) {
  console.error(`Unable to locate api tsx CLI: ${tsxCli}`);
  process.exit(1);
}

let fileEnv = {};
if (envFile) {
  const envPath = resolve(repoRoot, envFile);
  if (!existsSync(envPath)) {
    console.error(`Unable to locate environment file: ${envPath}`);
    process.exit(1);
  }
  fileEnv = parseEnv(readFileSync(envPath, 'utf8'));
}

const child = spawn(process.execPath, [tsxCli, ...args], {
  cwd: apiDir,
  // Keep the Node executable selected by the parent pnpm process. This is
  // required for Node 22's WebSocket support used by the Trigger.dev worker.
  env: {
    ...process.env,
    ...fileEnv,
    PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
  },
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
