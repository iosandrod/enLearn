import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tsCompiler from "typescript";
import { extractHeaderApi, resolveNativeSourceRoot } from "./header-api.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const sourceRoot = resolveNativeSourceRoot(project);
const mode = process.argv[2] ?? "all";

async function walk(directory, extension, ignored = new Set()) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path, extension, ignored)));
    else if (entry.isFile() && entry.name.endsWith(extension)) result.push(path);
  }
  return result.sort();
}

function normalizedRelative(root, path) {
  return relative(root, path).replace(/\\/g, "/");
}

function lineCount(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function cppDefinitions(text) {
  const result = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const qualified = /\b([A-Za-z_]\w*(?:::[~A-Za-z_]\w*)+)\s*\(/g;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || /^\s*(?:\/\/|#|return\b|if\b|for\b|while\b|switch\b)/.test(line)) continue;
    for (const match of line.matchAll(qualified)) {
      const name = match[1];
      if (!name || name.startsWith("std::") || name.startsWith("boost::") || name.startsWith("Py")) continue;
      const prefix = line.slice(0, match.index ?? 0);
      if (/[=.?!]\s*$/.test(prefix)) continue;
      result.push(name);
    }
  }
  return [...new Set(result)];
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === tsCompiler.SyntaxKind.ExportKeyword) ?? false;
}

function memberName(member, source) {
  if (!member.name) return "";
  if (tsCompiler.isIdentifier(member.name) || tsCompiler.isStringLiteral(member.name)) return member.name.text;
  return member.name.getText(source);
}

function collectTypeScriptModels(paths) {
  const normalizedPaths = new Set(paths.map((path) => resolve(path).toLowerCase()));
  const program = tsCompiler.createProgram(paths, {
    target: tsCompiler.ScriptTarget.ES2022,
    module: tsCompiler.ModuleKind.NodeNext,
    moduleResolution: tsCompiler.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
  });
  const models = new Map();
  for (const source of program.getSourceFiles()) {
    if (!normalizedPaths.has(resolve(source.fileName).toLowerCase())) continue;
    for (const statement of source.statements) {
      if ((!tsCompiler.isClassDeclaration(statement) && !tsCompiler.isInterfaceDeclaration(statement)) ||
          !statement.name || !hasExportModifier(statement)) continue;
      const methods = new Set();
      const bases = new Set();
      for (const member of statement.members) {
        if (tsCompiler.isMethodDeclaration(member) || tsCompiler.isMethodSignature(member) ||
            tsCompiler.isGetAccessorDeclaration(member) || tsCompiler.isSetAccessorDeclaration(member)) {
          const name = memberName(member, source);
          if (name) methods.add(name);
        }
        if (tsCompiler.isPropertyDeclaration(member) && member.name && memberName(member, source) === "cppBases" &&
            member.initializer && tsCompiler.isAsExpression(member.initializer) &&
            tsCompiler.isArrayLiteralExpression(member.initializer.expression)) {
          for (const element of member.initializer.expression.elements) {
            if (tsCompiler.isStringLiteral(element)) bases.add(element.text);
          }
        }
      }
      for (const clause of statement.heritageClauses ?? []) {
        for (const type of clause.types) {
          const name = type.expression.getText(source).match(/[A-Za-z_]\w*/g)?.at(-1);
          if (name) bases.add(name);
        }
      }
      const name = statement.name.text;
      const previous = models.get(name);
      if (previous) {
        for (const method of methods) previous.ownMethods.add(method);
        for (const base of bases) previous.ownBases.add(base);
        if (tsCompiler.isClassDeclaration(statement)) {
          previous.kind = "class";
          previous.file = normalizedRelative(project, source.fileName);
        }
      } else {
        models.set(name, {
          kind: tsCompiler.isClassDeclaration(statement) ? "class" : "interface",
          ownMethods: methods,
          ownBases: bases,
          file: normalizedRelative(project, source.fileName),
        });
      }
    }

    for (const statement of source.statements) {
      if (!tsCompiler.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!tsCompiler.isIdentifier(declaration.name) || !declaration.name.text.endsWith("CppModel") ||
            !declaration.initializer || !tsCompiler.isObjectLiteralExpression(declaration.initializer)) continue;
        const name = declaration.name.text.slice(0, -"CppModel".length);
        let model = models.get(name);
        if (!model) {
          model = {
            kind: "class",
            ownMethods: new Set(),
            ownBases: new Set(),
            file: normalizedRelative(project, source.fileName),
          };
          models.set(name, model);
        }
        for (const property of declaration.initializer.properties) {
          if (!tsCompiler.isPropertyAssignment(property)) continue;
          const propertyName = property.name.getText(source);
          const expression = tsCompiler.isAsExpression(property.initializer) ? property.initializer.expression : property.initializer;
          if (!tsCompiler.isArrayLiteralExpression(expression)) continue;
          const target = propertyName === "bases" ? model.ownBases : propertyName === "methods" ? model.ownMethods : undefined;
          if (!target) continue;
          for (const element of expression.elements) if (tsCompiler.isStringLiteral(element)) target.add(element.text);
        }
      }
    }
    const checker = program.getTypeChecker();
    for (const statement of source.statements) {
      if (!tsCompiler.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!tsCompiler.isIdentifier(declaration.name) || declaration.name.text.endsWith("CppModel")) continue;
        const symbol = checker.getSymbolAtLocation(declaration.name);
        if (!symbol) continue;
        const type = checker.getTypeOfSymbolAtLocation(symbol, declaration.name);
        if (!type.getConstructSignatures().length && !type.getProperty("prototype")) continue;
        const name = declaration.name.text;
        if (!models.has(name)) models.set(name, {
          kind: "class",
          ownMethods: new Set(),
          ownBases: new Set(),
          file: normalizedRelative(project, source.fileName),
        });
      }
    }
  }

  const resolveModel = (name, resolving = new Set()) => {
    const model = models.get(name);
    if (!model || model.methods) return model;
    if (resolving.has(name)) {
      model.methods = new Set(model.ownMethods);
      model.bases = new Set(model.ownBases);
      return model;
    }
    const nextResolving = new Set(resolving).add(name);
    const methods = new Set(model.ownMethods);
    const bases = new Set(model.ownBases);
    for (const baseName of model.ownBases) {
      const base = resolveModel(baseName, nextResolving);
      if (!base) continue;
      for (const method of base.methods) methods.add(method);
      for (const ancestor of base.bases) bases.add(ancestor);
    }
    model.methods = methods;
    model.bases = bases;
    return model;
  };
  for (const name of models.keys()) resolveModel(name);
  return models;
}

const cpp = await walk(sourceRoot, ".cpp");
const ts = await walk(project, ".ts", new Set(["dist", "node_modules", "scripts"]));
const expected = new Map(cpp.map((path) => [normalizedRelative(sourceRoot, path).replace(/\.cpp$/, ".ts"), path]));
const actual = new Map(ts.map((path) => [normalizedRelative(project, path), path]));
const failures = [];

if (mode === "all" || mode === "file-count") {
  if (cpp.length !== 57) failures.push(`source count: expected 57, received ${cpp.length}`);
  if (ts.length !== cpp.length) failures.push(`target count: expected ${cpp.length}, received ${ts.length}`);
}

if (mode === "all" || mode === "file-name") {
  for (const name of expected.keys()) if (!actual.has(name)) failures.push(`missing target: ${name}`);
  for (const name of actual.keys()) if (!expected.has(name)) failures.push(`unexpected target: ${name}`);
}

if (mode === "all" || mode === "line-count") {
  for (const [name, source] of expected) {
    const target = actual.get(name);
    if (!target) continue;
    const [sourceText, targetText] = await Promise.all([readFile(source, "utf8"), readFile(target, "utf8")]);
    const sourceLines = lineCount(sourceText);
    const targetLines = lineCount(targetText);
    if (targetLines < sourceLines) failures.push(`${name}: ${targetLines} target lines < ${sourceLines} source lines`);
  }
}

if (mode === "all" || mode === "public-api" || mode === "class-model") {
  const allTargets = (await Promise.all([...actual.values()].map((path) => readFile(path, "utf8")))).join("\n");
  for (const [name, source] of expected) {
    const target = actual.get(name);
    if (!target) continue;
    const [sourceText, targetText] = await Promise.all([readFile(source, "utf8"), readFile(target, "utf8")]);
    for (const definition of cppDefinitions(sourceText)) {
      if ((mode === "all" || mode === "public-api") && !targetText.includes(JSON.stringify(definition))) {
        failures.push(`${name}: missing definition ${definition}`);
      }
      if (mode === "all" || mode === "class-model") {
        const parts = definition.split("::");
        const className = parts.length > 1 ? parts.at(-2) : undefined;
        if (className && /^[A-Za-z_]\w*$/.test(className)) {
          const modeled = new RegExp(`(?:class|interface)\\s+${className}(?:Port)?\\b`).test(allTargets);
          if (!modeled) failures.push(`${name}: missing class model ${className}`);
        }
      }
    }
  }

  const [headerApi, targetModels] = await Promise.all([
    extractHeaderApi(project, sourceRoot),
    Promise.resolve(collectTypeScriptModels([...actual.values()])),
  ]);
  for (const declaration of headerApi) {
    const target = targetModels.get(declaration.adapterName);
    const location = `${declaration.header}:${declaration.line}`;
    if ((mode === "all" || mode === "class-model") && !target) {
      failures.push(`${location}: missing exported ${declaration.kind} model ${declaration.adapterName} (${declaration.qualifiedName})`);
      continue;
    }
    if (!target) continue;
    if (mode === "all" || mode === "public-api") {
      for (const method of declaration.methods) {
        if (!target.methods.has(method)) failures.push(`${location}: ${target.file} ${declaration.adapterName} is missing public method ${method}`);
      }
    }
    if (mode === "all" || mode === "class-model") {
      for (const base of declaration.bases) {
        if (!targetModels.has(base)) continue;
        if (!target.bases.has(base)) failures.push(`${location}: ${target.file} ${declaration.adapterName} is missing base/interface ${base}`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verification '${mode}' passed for ${cpp.length} source and ${ts.length} target files.`);
}
