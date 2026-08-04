const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return env;

      const separator = trimmed.indexOf('=');
      if (separator < 0) return env;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      env[key] = value;
      return env;
    }, {});
}

module.exports = function loadEnv() {
  const root = path.resolve(__dirname, '..');
  return {
    ...parseEnvFile(path.resolve(root, '.env')),
    ...parseEnvFile(path.resolve(root, '.env.local')),
    ...process.env,
  };
};
