import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractHeaderApi } from "./header-api.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const startMarker = "// <header-api-generated>";
const endMarker = "// </header-api-generated>";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["dist", "node_modules", "scripts"].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

function stripGenerated(source) {
  const start = source.indexOf(startMarker);
  if (start < 0) return source;
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Generated header model region has no end marker`);
  return `${source.slice(0, start)}${source.slice(end + endMarker.length).replace(/^\r?\n/, "")}`;
}

function modelOwner(name) {
  const rules = [
    [/^Calendar/, "model/calendar.ts"],
    [/^Customer/, "model/customer.ts"],
    [/^Supplier/, "model/supplier.ts"],
    [/^Skill/, "model/skill.ts"],
    [/^(ItemMTS|ItemMTO|Item$|ItemBuffer|ItemDemand|ItemOperation)/, "model/item.ts"],
    [/^(ItemSupplier|OperationItemSupplier)/, "model/itemsupplier.ts"],
    [/^(ItemDistribution|OperationItemDistribution)/, "model/itemdistribution.ts"],
    [/^ResourceSkill/, "model/resourceskill.ts"],
    [/^Resource/, "model/resource.ts"],
    [/^Buffer/, "model/buffer.ts"],
    [/^FlowPlan/, "model/flowplan.ts"],
    [/^Flow/, "model/flow.ts"],
    [/^LoadPlan/, "model/loadplan.ts"],
    [/^Load/, "model/load.ts"],
    [/^SubOperation/, "model/suboperation.ts"],
    [/^OperationPlanDependency/, "model/operationdependency.ts"],
    [/^OperationDependency/, "model/operationdependency.ts"],
    [/^OperationPlan/, "model/operationplan.ts"],
    [/^Operation/, "model/operation.ts"],
    [/^Demand/, "model/demand.ts"],
    [/^Pegging/, "model/pegging.ts"],
    [/^Setup/, "model/setupmatrix.ts"],
    [/^(ProblemMaterialShortage)/, "model/problems_buffer.ts"],
    [/^(ProblemCapacityOverload)/, "model/problems_resource.ts"],
    [/^(ProblemBeforeCurrent|ProblemAwaitSupply|ProblemPrecedence|ProblemSyncDemand|ProblemInvalidData|Constraint)/, "model/problems_operationplan.ts"],
    [/^(Problem|HasProblems|Plannable)/, "model/problem.ts"],
    [/^Command/, "model/actions.ts"],
    [/^Solver$/, "model/solver.ts"],
    [/^Plan$/, "model/plan.ts"],
    [/^HasLevel$/, "model/leveled.ts"],
    [/^Location/, "model/location.ts"],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? "model/library.ts";
}

function ownerFor(declaration) {
  switch (declaration.header) {
    case "cache.h": return "utils/cache.ts";
    case "database.h": return "utils/database.ts";
    case "json.h": return "utils/json.ts";
    case "xml.h": return "utils/xml.ts";
    case "tags.h": return "tags.ts";
    case "timeline.h": return "model/flowplan.ts";
    case "forecast.h":
      if (/^ForecastSolver/.test(declaration.adapterName)) return "forecast/forecastsolver.ts";
      if (/^(ForecastMeasure|Measure|Measures)/.test(declaration.adapterName)) return "forecast/measure.ts";
      if (/^ProblemOutlier/.test(declaration.adapterName)) return "forecast/forecastsolver.ts";
      return "forecast/forecast.ts";
    case "solver.h":
      if (/^OperatorBackward/.test(declaration.adapterName)) return "solver/operatorbackward.ts";
      if (/^OperatorForward/.test(declaration.adapterName)) return "solver/operatorforward.ts";
      if (/^OperatorDelete/.test(declaration.adapterName)) return "solver/operatordelete.ts";
      return "solver/solverplan.ts";
    case "model.h": return modelOwner(declaration.adapterName);
    default:
      if (/^Command/.test(declaration.adapterName)) return "utils/actions.ts";
      if (/^Python/.test(declaration.adapterName)) return "utils/python.ts";
      return "utils/library.ts";
  }
}

function importPath(target) {
  const library = resolve(project, "utils", "library.js");
  let path = relative(dirname(target), library).replace(/\\/g, "/");
  if (!path.startsWith(".")) path = `./${path}`;
  return path;
}

function renderDeclaration(name, declarations) {
  const methods = [...new Set(declarations.flatMap((entry) => entry.methods))].sort();
  const bases = [...new Set(declarations.flatMap((entry) => entry.bases))].sort();
  const qualified = declarations.map((entry) => entry.qualifiedName);
  const overrides = new Set(["dispose", "toString", "writeProperties"]);
  const classLines = [
    `export class ${name} extends HeaderModelAdapter {`,
    `  static readonly cppBases = ${JSON.stringify(bases)} as const;`,
    `  static readonly cppQualifiedNames = ${JSON.stringify(qualified)} as const;`,
    ...methods.map((method) => `  ${overrides.has(method) ? "override " : ""}${method}(...args: readonly unknown[]): ${method === "toString" ? "string" : "unknown"} { return ${method === "toString" ? "String(" : ""}this.invokeAdapter(${JSON.stringify(method)}, args)${method === "toString" ? ")" : ""}; }`),
    "}",
  ];
  return classLines.join("\n");
}

function renderAugmentation(name, declarations) {
  const methods = [...new Set(declarations.flatMap((entry) => entry.methods))].sort();
  const bases = [...new Set(declarations.flatMap((entry) => entry.bases))].sort();
  return [
    `export const ${name}CppModel = { bases: ${JSON.stringify(bases)} as const, methods: ${JSON.stringify(methods)} as const, qualifiedNames: ${JSON.stringify(declarations.map((entry) => entry.qualifiedName))} as const };`,
  ].join("\n");
}

function insertGenerated(source, region, usesLocalAdapter) {
  if (!usesLocalAdapter) return `${region}${source}`;
  const declaration = "export class HeaderModelAdapter";
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error("HeaderModelAdapter declaration wasn't found");
  const body = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("HeaderModelAdapter declaration isn't balanced");
  return `${source.slice(0, end)}\n\n${region}${source.slice(end).replace(/^\r?\n+/, "")}`;
}

const paths = await walk(project);
const cleanSources = new Map();
const existing = new Set();
for (const path of paths) {
  const clean = stripGenerated(await readFile(path, "utf8"));
  cleanSources.set(path, clean);
  for (const match of clean.matchAll(/\bexport\s+(?:abstract\s+)?(?:class|interface)\s+([A-Za-z_]\w*)/g)) existing.add(match[1]);
  for (const match of clean.matchAll(/\bexport\s+const\s+([A-Za-z_]\w*)\s*=/g)) existing.add(match[1]);
  for (const match of clean.matchAll(/\bexport\s+const\s+([A-Za-z_]\w*)\s*=\s*new\s+class\b/g)) existing.add(match[1]);
}

const groupedNames = new Map();
for (const declaration of await extractHeaderApi(project)) {
  const owner = resolve(project, ownerFor(declaration));
  const names = groupedNames.get(owner) ?? new Map();
  const group = names.get(declaration.adapterName) ?? { declarations: [], existing: existing.has(declaration.adapterName) };
  group.declarations.push(declaration);
  names.set(declaration.adapterName, group);
  groupedNames.set(owner, names);
}

for (const path of paths) {
  let source = cleanSources.get(path);
  const names = groupedNames.get(path);
  if (names?.size) {
    const usesLocalAdapter = path === resolve(project, "utils", "library.ts");
    const needsAdapter = [...names.values()].some((group) => !group.existing);
    const hasAdapterImport = /import\s*\{[^}]*\bHeaderModelAdapter\b(?!\s+as\b)[^}]*\}\s*from\s*["'][^"']+["']/.test(source);
    const imports = usesLocalAdapter || !needsAdapter || hasAdapterImport
      ? ""
      : `import { HeaderModelAdapter } from ${JSON.stringify(importPath(path))};\n\n`;
    const declarations = [...names.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, group]) => group.existing
        ? renderAugmentation(name, group.declarations)
        : renderDeclaration(name, group.declarations))
      .join("\n\n");
    const region = `${startMarker}\n${imports}${declarations}\n${endMarker}\n\n`;
    source = insertGenerated(source, region, usesLocalAdapter);
  }
  await writeFile(path, source, "utf8");
}

const generatedCount = [...groupedNames.values()].reduce((sum, names) => sum + names.size, 0);
console.log(`Generated ${generatedCount} header API adapter models across ${groupedNames.size} TypeScript files.`);
