import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import Parser from "tree-sitter";
import Cpp from "tree-sitter-cpp";

const parser = new Parser();
parser.setLanguage(Cpp);

async function walk(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, extension)));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(path);
  }
  return files.sort();
}

function capitalize(name) {
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : name;
}

function terminalIdentifier(text) {
  const withoutTemplates = text.replace(/<.*>/s, "");
  return withoutTemplates.match(/[A-Za-z_]\w*/g)?.at(-1) ?? "";
}

function declarationName(node) {
  const name = node.childForFieldName("name")?.text ?? "";
  return terminalIdentifier(name);
}

function functionName(node) {
  let declarator = node.childForFieldName("declarator");
  while (declarator) {
    if (["identifier", "field_identifier", "type_identifier"].includes(declarator.type)) return declarator.text;
    if (declarator.type === "destructor_name" || declarator.type === "operator_name") return "";
    declarator = declarator.childForFieldName("declarator") ?? declarator.namedChildren.find((child) =>
      ["identifier", "field_identifier", "type_identifier", "destructor_name", "operator_name"].includes(child.type),
    );
  }
  return "";
}

function nearestClass(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "class_specifier" || current.type === "struct_specifier") return current;
  }
  return null;
}

function sameSyntaxNode(left, right) {
  return left !== null && right !== null &&
    left.type === right.type &&
    left.startIndex === right.startIndex &&
    left.endIndex === right.endIndex;
}

function directFunctionDeclarators(node, owner, result = []) {
  if (node !== owner && (node.type === "class_specifier" || node.type === "struct_specifier")) return result;
  // Function bodies can contain declarations that tree-sitter represents with
  // a function_declarator (eg "unique_lock<mutex> l(lock)").  Those are local
  // implementation details, not members of the surrounding class.
  if (node.type === "compound_statement" || node.type === "lambda_expression") return result;
  if (node.type === "function_declarator" && sameSyntaxNode(nearestClass(node), owner)) result.push(node);
  for (const child of node.namedChildren) directFunctionDeclarators(child, owner, result);
  return result;
}

function baseNames(node) {
  const clause = node.namedChildren.find((child) => child.type === "base_class_clause");
  if (!clause) return [];
  const result = [];
  for (const child of clause.namedChildren) {
    if (["access_specifier", "virtual_specifier"].includes(child.type)) continue;
    const name = terminalIdentifier(child.text);
    if (name) result.push(name);
  }
  return [...new Set(result)];
}

function publicMethods(node, className) {
  const body = node.childForFieldName("body");
  if (!body) return [];
  let access = node.type === "struct_specifier" ? "public" : "private";
  const methods = new Set();
  for (const child of body.namedChildren) {
    if (child.type === "access_specifier") {
      access = child.text.replace(":", "").trim();
      continue;
    }
    if (access !== "public") continue;
    for (const declarator of directFunctionDeclarators(child, node)) {
      const name = functionName(declarator);
      if (name && name !== className && !name.startsWith("operator")) methods.add(name);
    }
  }
  return [...methods].sort();
}

function collectDefinitions(source, filename) {
  const root = parser.parse(source).rootNode;
  const definitions = [];

  function visit(node, owners = []) {
    const isClass = node.type === "class_specifier" || node.type === "struct_specifier";
    let nestedOwners = owners;
    if (isClass) {
      const body = node.childForFieldName("body");
      const name = declarationName(node);
      if (body && name) {
        const qualifiedText = node.childForFieldName("name")?.text ?? name;
        const explicitOwners = qualifiedText.includes("::")
          ? qualifiedText.split("::").slice(0, -1).map(terminalIdentifier).filter(Boolean)
          : owners;
        const path = [...explicitOwners, name];
        const adapterName = path.length === 1 ? name : path.map(capitalize).join("");
        definitions.push({
          name,
          qualifiedName: path.join("::"),
          adapterName,
          nested: path.length > 1,
          kind: node.type === "struct_specifier" ? "struct" : "class",
          bases: baseNames(node),
          methods: publicMethods(node, name),
          header: filename,
          line: node.startPosition.row + 1,
        });
        nestedOwners = path;
      }
    }
    for (const child of node.namedChildren) visit(child, nestedOwners);
  }

  visit(root);
  return definitions;
}

export async function extractHeaderApi(project) {
  const includeRoot = resolve(project, "..", "include", "frepple");
  const forecastHeader = resolve(project, "..", "src", "forecast", "forecast.h");
  const headers = [...(await walk(includeRoot, ".h")), forecastHeader];
  const models = [];
  for (const header of headers) {
    const source = await readFile(header, "utf8");
    models.push(...collectDefinitions(source, basename(header)));
  }

  const unique = new Map();
  for (const model of models) {
    const previous = unique.get(model.qualifiedName);
    if (!previous || model.methods.length > previous.methods.length) unique.set(model.qualifiedName, model);
  }
  const definitions = [...unique.values()];
  const qualified = new Map(definitions.map((model) => [model.qualifiedName, model.adapterName]));
  for (const model of definitions) {
    const owners = model.qualifiedName.split("::").slice(0, -1);
    model.bases = model.bases.map((base) => {
      for (let depth = owners.length; depth >= 0; depth -= 1) {
        const candidate = [...owners.slice(0, depth), base].join("::");
        const adapterName = qualified.get(candidate);
        if (adapterName) return adapterName;
      }
      return base;
    });
  }
  return definitions.sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName));
}
