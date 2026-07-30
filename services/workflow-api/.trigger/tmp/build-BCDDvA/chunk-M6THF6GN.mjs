import {
  __name,
  init_esm
} from "./chunk-65XIAWWW.mjs";

// src/common/env.ts
init_esm();
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
var cachedEnv;
function getWorkflowEnv() {
  if (cachedEnv) return cachedEnv;
  const cwd = process.cwd();
  const runningFromWorkflowApi = basename(cwd) === "workflow-api";
  const repoRoot = runningFromWorkflowApi ? resolve(cwd, "..", "..") : cwd;
  const workflowApiRoot = runningFromWorkflowApi ? cwd : resolve(repoRoot, "services", "workflow-api");
  const fileEnv = {
    ...parseEnvFile(resolve(repoRoot, ".env")),
    ...parseEnvFile(resolve(repoRoot, ".env.local")),
    ...parseEnvFile(resolve(workflowApiRoot, ".env")),
    ...parseEnvFile(resolve(workflowApiRoot, ".env.local"))
  };
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === void 0) {
      process.env[key] = value;
    }
  }
  cachedEnv = {
    ...fileEnv,
    ...process.env
  };
  return cachedEnv;
}
__name(getWorkflowEnv, "getWorkflowEnv");
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  return readFileSync(filePath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return env;
    }
    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      return env;
    }
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    env[key] = rawValue.replace(/^["']|["']$/g, "");
    return env;
  }, {});
}
__name(parseEnvFile, "parseEnvFile");

export {
  getWorkflowEnv
};
//# sourceMappingURL=chunk-M6THF6GN.mjs.map
