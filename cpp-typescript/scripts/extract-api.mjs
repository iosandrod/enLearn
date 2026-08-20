import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractHeaderApi } from "./header-api.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const output = resolve(here, "header-api.snapshot.json");
const declarations = await extractHeaderApi(project);
await writeFile(output, `${JSON.stringify({ version: 1, declarations }, null, 2)}\n`, "utf8");
console.log(`Extracted ${declarations.length} class and struct definitions to ${output}.`);
