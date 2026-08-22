import { resolve } from "node:path";
import { typescriptWorker } from "./compare-scheduling.mjs";

const modelPath = process.argv[2];
const resultPath = process.argv[3];

if (!modelPath || !resultPath) {
  console.error("Usage: node planning-worker.mjs <model.json> <result.json>");
  process.exitCode = 2;
} else {
  try {
    await typescriptWorker(resolve(modelPath), resolve(resultPath), "planning");
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}
