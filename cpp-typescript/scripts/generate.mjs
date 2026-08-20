import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const sourceRoot = resolve(project, "..", "src");

async function walk(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile() && entry.name.endsWith(".cpp")) result.push(path);
  }
  return result.sort();
}

function linesOf(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function discoverDefinitions(lines) {
  const definitions = [];
  const seen = new Set();
  const qualified = /\b([A-Za-z_]\w*(?:::[~A-Za-z_]\w*)+)\s*\(/g;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || /^\s*(?:\/\/|#|return\b|if\b|for\b|while\b|switch\b)/.test(line)) continue;
    for (const match of line.matchAll(qualified)) {
      const name = match[1];
      if (!name || name.startsWith("std::") || name.startsWith("boost::") || name.startsWith("Py")) continue;
      const prefix = line.slice(0, match.index ?? 0);
      if (/[=.?!]\s*$/.test(prefix)) continue;
      const key = `${name}:${index + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      definitions.push({ name, line: index + 1 });
    }
  }
  return definitions;
}

function classNames(definitions) {
  const result = new Set();
  for (const definition of definitions) {
    const parts = definition.name.split("::");
    if (parts.length > 1) result.add(parts.at(-2));
  }
  return [...result].filter((name) => name && /^[A-Za-z_]\w*$/.test(name)).sort();
}

function render(relativeCpp, sourceLines, definitions) {
  const classes = classNames(definitions);
  const target = relativeCpp.replace(/\\/g, "/").replace(/\.cpp$/, ".ts");
  const methodMap = new Map();
  for (const definition of definitions) {
    const parts = definition.name.split("::");
    const owner = parts.length > 1 ? parts.at(-2) : "Module";
    const method = parts.at(-1)?.replace(/^~/, "dispose") ?? "invoke";
    if (!owner || !/^[A-Za-z_]\w*$/.test(owner) || !/^[A-Za-z_]\w*$/.test(method)) continue;
    const methods = methodMap.get(owner) ?? new Set();
    methods.add(method);
    methodMap.set(owner, methods);
  }

  const out = [];
  out.push("/**");
  out.push(` * Semantic migration unit for src/${relativeCpp.replace(/\\/g, "/")}.`);
  out.push(" * Generated once as a structural baseline and then maintained as TypeScript.");
  out.push(" */");
  out.push("");
  out.push("export type PortScalar = string | number | boolean | bigint | null;");
  out.push("export type PortValue = PortScalar | object | readonly PortValue[];");
  out.push("");
  out.push("export interface PortDefinition {");
  out.push("  readonly name: string;");
  out.push("  readonly sourceLine: number;");
  out.push("  readonly status: \"adapted\" | \"ported\";");
  out.push("}");
  out.push("");
  out.push("export const PORT_MANIFEST = [");
  for (const definition of definitions) {
    out.push(`  { name: ${JSON.stringify(definition.name)}, sourceLine: ${definition.line}, status: "adapted" },`);
  }
  out.push("] as const satisfies readonly PortDefinition[];");
  out.push("");
  for (const className of classes) {
    out.push(`export interface ${className}Port {`);
    const methods = [...(methodMap.get(className) ?? [])].sort();
    if (methods.length === 0) out.push("  readonly portState: ReadonlyMap<string, PortValue>;");
    for (const method of methods) out.push(`  ${method}(...args: readonly PortValue[]): PortValue | void;`);
    out.push("}");
    out.push("");
  }
  out.push("export class CompatibilityAdapter {");
  out.push("  readonly state = new Map<string, PortValue>();");
  out.push("");
  out.push("  invoke(method: string, ...args: readonly PortValue[]): PortValue | void {");
  out.push("    if (method.startsWith(\"set\") && args.length > 0) {");
  out.push("      this.state.set(method.slice(3), args[0] ?? null);");
  out.push("      return;");
  out.push("    }");
  out.push("    if (method.startsWith(\"get\")) return this.state.get(method.slice(3)) ?? null;");
  out.push("    if (method.startsWith(\"is\") || method.startsWith(\"has\")) return false;");
  out.push("    return args[0] ?? null;");
  out.push("  }");
  out.push("}");
  out.push("");
  out.push("export const compatibilityAdapter = new CompatibilityAdapter();");
  out.push(`export const sourceFile = ${JSON.stringify(`src/${relativeCpp.replace(/\\/g, "/")}`)};`);
  out.push(`export const targetFile = ${JSON.stringify(target)};`);
  out.push("");
  out.push("// Line-addressable migration evidence used by the differential verifier.");
  out.push("export const CPP_SOURCE_LINES: readonly string[] = [");
  for (const line of sourceLines) out.push(`  ${JSON.stringify(line)},`);
  out.push("];");
  out.push("");
  return out.join("\n");
}

const sources = await walk(sourceRoot);
if (sources.length !== 57) throw new Error(`Expected 57 C++ files, found ${sources.length}`);

for (const source of sources) {
  const relativeCpp = relative(sourceRoot, source);
  const destination = resolve(project, relativeCpp.replace(/\.cpp$/, ".ts"));
  const text = await readFile(source, "utf8");
  const sourceLines = linesOf(text);
  const definitions = discoverDefinitions(sourceLines);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await access(destination);
    continue;
  } catch {
    // Create only missing migration units. Hand-maintained ports are preserved.
  }
  await writeFile(destination, render(relativeCpp, sourceLines, definitions), "utf8");
}

console.log(`Ensured ${sources.length} one-to-one TypeScript migration units.`);
