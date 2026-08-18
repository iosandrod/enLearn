const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('A command is required.');
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : args[0];
const commandArgs = isWindows ? ['/d', '/s', '/c', args.join(' ')] : args.slice(1);
const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS || '--openssl-legacy-provider',
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
