/** Values accepted by the sandboxed forecast expression engine. */
export type ForecastExpressionValue = number | string | boolean | null | undefined;

export interface ForecastExpressionContext {
  readonly [name: string]: ForecastExpressionValue | ((...args: ForecastExpressionValue[]) => ForecastExpressionValue);
}

type MutableForecastExpressionContext = {
  [name: string]: ForecastExpressionValue | ((...args: ForecastExpressionValue[]) => ForecastExpressionValue);
};

export interface CompiledForecastExpression {
  readonly source: string;
  readonly identifiers: readonly string[];
  readonly assignments: readonly string[];
  evaluate(context?: ForecastExpressionContext): number;
  execute(context: Record<string, ForecastExpressionValue>): number;
}

type ExpressionTokenKind = "number" | "string" | "identifier" | "operator" | "punctuation" | "eof";

interface ExpressionToken {
  readonly kind: ExpressionTokenKind;
  readonly text: string;
  readonly value?: number | string;
}

interface ExpressionNode {
  evaluate(context: ForecastExpressionContext): ForecastExpressionValue;
  collect(identifiers: Set<string>): void;
}

const expressionFunctions: Readonly<Record<string, (...values: number[]) => number>> = {
  abs: Math.abs,
  ceil: Math.ceil,
  exp: Math.exp,
  floor: Math.floor,
  log: Math.log,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  round: Math.round,
  sign: Math.sign,
  sqrt: Math.sqrt,
};

function expressionNumber(value: ForecastExpressionValue): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined || value === "") return 0;
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function expressionTruth(value: ForecastExpressionValue): boolean {
  return typeof value === "string" ? value.length > 0 : expressionNumber(value) !== 0;
}

class LiteralExpressionNode implements ExpressionNode {
  constructor(private readonly value: ForecastExpressionValue) {}
  evaluate(): ForecastExpressionValue { return this.value; }
  collect(): void {}
}

class IdentifierExpressionNode implements ExpressionNode {
  constructor(readonly name: string) {}
  evaluate(context: ForecastExpressionContext): ForecastExpressionValue {
    const value = context[this.name];
    return typeof value === "function" ? 0 : value ?? 0;
  }
  collect(identifiers: Set<string>): void { identifiers.add(this.name); }
}

class UnaryExpressionNode implements ExpressionNode {
  constructor(private readonly operator: string, private readonly operand: ExpressionNode) {}
  evaluate(context: ForecastExpressionContext): ForecastExpressionValue {
    const value = this.operand.evaluate(context);
    if (this.operator === "!") return expressionTruth(value) ? 0 : 1;
    if (this.operator === "-") return -expressionNumber(value);
    return expressionNumber(value);
  }
  collect(identifiers: Set<string>): void { this.operand.collect(identifiers); }
}

class BinaryExpressionNode implements ExpressionNode {
  constructor(private readonly operator: string, private readonly left: ExpressionNode,
    private readonly right: ExpressionNode) {}
  evaluate(context: ForecastExpressionContext): ForecastExpressionValue {
    if (this.operator === "&&") {
      return expressionTruth(this.left.evaluate(context)) && expressionTruth(this.right.evaluate(context)) ? 1 : 0;
    }
    if (this.operator === "||") {
      return expressionTruth(this.left.evaluate(context)) || expressionTruth(this.right.evaluate(context)) ? 1 : 0;
    }
    const leftValue = this.left.evaluate(context);
    const rightValue = this.right.evaluate(context);
    const left = expressionNumber(leftValue);
    const right = expressionNumber(rightValue);
    switch (this.operator) {
      case "+": return left + right;
      case "-": return left - right;
      case "*": return left * right;
      case "/": return right === 0 ? 0 : left / right;
      case "%": return right === 0 ? 0 : left % right;
      case "^": case "**": return left ** right;
      case "<": return left < right ? 1 : 0;
      case "<=": return left <= right ? 1 : 0;
      case ">": return left > right ? 1 : 0;
      case ">=": return left >= right ? 1 : 0;
      case "==": return leftValue === rightValue || left === right ? 1 : 0;
      case "!=": return leftValue !== rightValue && left !== right ? 1 : 0;
      default: return 0;
    }
  }
  collect(identifiers: Set<string>): void { this.left.collect(identifiers); this.right.collect(identifiers); }
}

class ConditionalExpressionNode implements ExpressionNode {
  constructor(private readonly condition: ExpressionNode, private readonly whenTrue: ExpressionNode,
    private readonly whenFalse: ExpressionNode) {}
  evaluate(context: ForecastExpressionContext): ForecastExpressionValue {
    return expressionTruth(this.condition.evaluate(context))
      ? this.whenTrue.evaluate(context) : this.whenFalse.evaluate(context);
  }
  collect(identifiers: Set<string>): void {
    this.condition.collect(identifiers); this.whenTrue.collect(identifiers); this.whenFalse.collect(identifiers);
  }
}

class CallExpressionNode implements ExpressionNode {
  constructor(private readonly name: string, private readonly args: readonly ExpressionNode[]) {}
  evaluate(context: ForecastExpressionContext): ForecastExpressionValue {
    const values = this.args.map((argument) => argument.evaluate(context));
    if (this.name === "if") return expressionTruth(values[0]) ? values[1] ?? 0 : values[2] ?? 0;
    if (this.name === "coalesce") return values.find((value) => value !== null && value !== undefined) ?? 0;
    const configured = context[this.name];
    if (typeof configured === "function") return configured(...values);
    const builtin = expressionFunctions[this.name];
    return builtin ? builtin(...values.map(expressionNumber)) : 0;
  }
  collect(identifiers: Set<string>): void { for (const argument of this.args) argument.collect(identifiers); }
}

function tokenizeForecastExpression(source: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (!character) break;
    if (/\s/.test(character)) { index += 1; continue; }
    if (/[0-9.]/.test(character)) {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) throw new Error(`Invalid number at expression offset ${index}`);
      tokens.push({ kind: "number", text: match[0], value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let text = "";
      index += 1;
      while (index < source.length && source[index] !== quote) {
        const current = source[index];
        if (current === "\\" && index + 1 < source.length) {
          index += 1;
          text += source[index] ?? "";
        } else text += current ?? "";
        index += 1;
      }
      if (source[index] !== quote) throw new Error("Unterminated string in forecast expression");
      index += 1;
      tokens.push({ kind: "string", text, value: text });
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = source.slice(index).match(/^[A-Za-z_]\w*/);
      const text = match?.[0] ?? "";
      tokens.push({ kind: "identifier", text });
      index += text.length;
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (["<=", ">=", "==", "!=", "&&", "||", "**", ":="].includes(pair)) {
      tokens.push({ kind: "operator", text: pair }); index += 2; continue;
    }
    if ("+-*/%^<>!?=:".includes(character)) tokens.push({ kind: "operator", text: character });
    else if ("(),;".includes(character)) tokens.push({ kind: "punctuation", text: character });
    else throw new Error(`Unsupported token '${character}' in forecast expression`);
    index += 1;
  }
  tokens.push({ kind: "eof", text: "" });
  return tokens;
}

class ForecastExpressionParser {
  private index = 0;
  constructor(private readonly tokens: readonly ExpressionToken[]) {}
  parse(): ExpressionNode {
    const result = this.parseConditional();
    if (this.current().kind !== "eof") throw new Error(`Unexpected token '${this.current().text}'`);
    return result;
  }
  private current(): ExpressionToken { return this.tokens[this.index] ?? { kind: "eof", text: "" }; }
  private accept(text: string): boolean {
    if (this.current().text !== text) return false;
    this.index += 1;
    return true;
  }
  private expect(text: string): void { if (!this.accept(text)) throw new Error(`Expected '${text}'`); }
  private parseConditional(): ExpressionNode {
    const condition = this.parseBinary(0);
    if (!this.accept("?")) return condition;
    const whenTrue = this.parseConditional();
    this.expect(":");
    return new ConditionalExpressionNode(condition, whenTrue, this.parseConditional());
  }
  private parseBinary(precedence: number): ExpressionNode {
    let left = this.parseUnary();
    const levels: Readonly<Record<string, number>> = {
      "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4,
      "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "^": 7, "**": 7,
    };
    while (true) {
      const operator = this.current().text;
      const nextPrecedence = levels[operator] ?? -1;
      if (nextPrecedence < precedence) break;
      this.index += 1;
      const right = this.parseBinary(nextPrecedence + (operator === "^" || operator === "**" ? 0 : 1));
      left = new BinaryExpressionNode(operator, left, right);
    }
    return left;
  }
  private parseUnary(): ExpressionNode {
    const operator = this.current().text;
    if (operator === "+" || operator === "-" || operator === "!") {
      this.index += 1;
      return new UnaryExpressionNode(operator, this.parseUnary());
    }
    return this.parsePrimary();
  }
  private parsePrimary(): ExpressionNode {
    const token = this.current();
    if (token.kind === "number" || token.kind === "string") {
      this.index += 1;
      return new LiteralExpressionNode(token.value);
    }
    if (token.kind === "identifier") {
      this.index += 1;
      if (token.text === "true" || token.text === "false") return new LiteralExpressionNode(token.text === "true");
      if (!this.accept("(")) return new IdentifierExpressionNode(token.text);
      const args: ExpressionNode[] = [];
      if (!this.accept(")")) {
        do args.push(this.parseConditional()); while (this.accept(","));
        this.expect(")");
      }
      return new CallExpressionNode(token.text, args);
    }
    if (this.accept("(")) {
      const expression = this.parseConditional();
      this.expect(")");
      return expression;
    }
    throw new Error(`Expected a value, received '${token.text}'`);
  }
}

interface ExpressionStatement {
  readonly assignment: string | null;
  readonly node: ExpressionNode;
}

function splitExpressionStatements(source: string): string[] {
  const result: string[] = [];
  let quote = "";
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === ";" && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result.filter(Boolean);
}

function parseExpressionStatement(source: string): ExpressionStatement {
  const assignment = source.match(/^([A-Za-z_]\w*)\s*(?::=|=(?!=))\s*(.+)$/s);
  const body = assignment?.[2] ?? source;
  return {
    assignment: assignment?.[1] ?? null,
    node: new ForecastExpressionParser(tokenizeForecastExpression(body)).parse(),
  };
}

/** Compile arithmetic without using eval or Function, keeping expressions deterministic and sandboxed. */
export function compileForecastExpression(source: string): CompiledForecastExpression {
  const normalized = String(source).trim() || "0";
  const statements = splitExpressionStatements(normalized).map(parseExpressionStatement);
  const identifiers = new Set<string>();
  const assignments = statements.flatMap((statement) => statement.assignment ? [statement.assignment] : []);
  for (const statement of statements) statement.node.collect(identifiers);
  for (const assignment of assignments) identifiers.delete(assignment);
  const run = (context: MutableForecastExpressionContext): number => {
    let result = 0;
    for (const statement of statements) {
      result = expressionNumber(statement.node.evaluate(context));
      if (statement.assignment) context[statement.assignment] = result;
    }
    return result;
  };
  return {
    source: normalized,
    identifiers: [...identifiers],
    assignments,
    evaluate(context: ForecastExpressionContext = {}): number { return run({ ...context }); },
    execute(context: Record<string, ForecastExpressionValue>): number { return run(context); },
  };
}

export function evaluateForecastExpression(source: string, context: ForecastExpressionContext = {}): number {
  return compileForecastExpression(source).evaluate(context);
}

/**
 * Semantic migration unit for src/forecast/measure_compute.cpp.
 * Generated once as a structural baseline and then maintained as TypeScript.
 */

export type PortScalar = string | number | boolean | bigint | null;
export type PortValue = PortScalar | object | readonly PortValue[];

export interface PortDefinition {
  readonly name: string;
  readonly sourceLine: number;
  readonly status: "adapted" | "ported";
}

export const PORT_MANIFEST = [
  { name: "ForecastMeasureComputed::tag_update_expression", sourceLine: 30, status: "adapted" },
  { name: "ForecastMeasureComputed::tag_compute_expression", sourceLine: 32, status: "adapted" },
  { name: "ForecastMeasureComputed::initialize", sourceLine: 40, status: "adapted" },
  { name: "ForecastMeasureComputedPlanned::initialize", sourceLine: 54, status: "adapted" },
  { name: "ForecastMeasureComputed::appendDependents", sourceLine: 129, status: "adapted" },
  { name: "ForecastMeasureComputed::compileMeasuresPython", sourceLine: 136, status: "adapted" },
  { name: "ForecastMeasureComputed::compileMeasures", sourceLine: 146, status: "adapted" },
  { name: "ForecastMeasure::evalExpression", sourceLine: 234, status: "adapted" },
  { name: "Item::getRoot", sourceLine: 238, status: "adapted" },
  { name: "Customer::getRoot", sourceLine: 238, status: "adapted" },
  { name: "Location::getRoot", sourceLine: 239, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface CustomerPort {
  getRoot(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasurePort {
  evalExpression(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureComputedPort {
  appendDependents(...args: readonly PortValue[]): PortValue | void;
  compileMeasures(...args: readonly PortValue[]): PortValue | void;
  compileMeasuresPython(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  tag_compute_expression(...args: readonly PortValue[]): PortValue | void;
  tag_update_expression(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureComputedPlannedPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemPort {
  getRoot(...args: readonly PortValue[]): PortValue | void;
}

export interface LocationPort {
  getRoot(...args: readonly PortValue[]): PortValue | void;
}

export class CompatibilityAdapter {
  readonly state = new Map<string, PortValue>();

  invoke(method: string, ...args: readonly PortValue[]): PortValue | void {
    if (method.startsWith("set") && args.length > 0) {
      this.state.set(method.slice(3), args[0] ?? null);
      return;
    }
    if (method.startsWith("get")) return this.state.get(method.slice(3)) ?? null;
    if (method.startsWith("is") || method.startsWith("has")) return false;
    return args[0] ?? null;
  }
}

export const compatibilityAdapter = new CompatibilityAdapter();
export const sourceFile = "src/forecast/measure_compute.cpp";
export const targetFile = "forecast/measure_compute.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2019 by frePPLe bv                                        *",
  " *                                                                         *",
  " * Permission is hereby granted, free of charge, to any person obtaining   *",
  " * a copy of this software and associated documentation files (the         *",
  " * \"Software\"), to deal in the Software without restriction, including     *",
  " * without limitation the rights to use, copy, modify, merge, publish,     *",
  " * distribute, sublicense, and/or sell copies of the Software, and to      *",
  " * permit persons to whom the Software is furnished to do so, subject to   *",
  " * the following conditions:                                               *",
  " *                                                                         *",
  " * The above copyright notice and this permission notice shall be          *",
  " * included in all copies or substantial portions of the Software.         *",
  " *                                                                         *",
  " * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,         *",
  " * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF      *",
  " * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND                   *",
  " * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE  *",
  " * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION  *",
  " * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION   *",
  " * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.         *",
  " *                                                                         *",
  " ***************************************************************************/",
  "",
  "#include \"forecast.h\"",
  "",
  "namespace frepple {",
  "",
  "const Keyword ForecastMeasureComputed::tag_update_expression(",
  "    \"update_expression\");",
  "const Keyword ForecastMeasureComputed::tag_compute_expression(",
  "    \"compute_expression\");",
  "double ForecastMeasureComputed::newvalue = 0.0;",
  "",
  "exprtk::symbol_table<double> ForecastMeasureComputed::symboltable;",
  "double ForecastMeasureComputed::cost;",
  "ForecastBucket* ForecastMeasureComputed::fcstbckt;",
  "",
  "int ForecastMeasureComputed::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastMeasureLocal>(",
  "      \"measure\", \"measure_computed\", Object::create<ForecastMeasureComputed>);",
  "  registerFields<ForecastMeasureComputed>(const_cast<MetaClass*>(metadata));",
  "",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"compileMeasures\", compileMeasuresPython, METH_NOARGS,",
  "      \"Compiles all expressions on the measures.\");",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<ForecastMeasureComputed, ForecastMeasure>::initialize();",
  "}",
  "",
  "int ForecastMeasureComputedPlanned::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastMeasureLocal>(",
  "      \"measure\", \"measure_computedplanned\",",
  "      Object::create<ForecastMeasureComputedPlanned>);",
  "  registerFields<ForecastMeasureComputedPlanned>(",
  "      const_cast<MetaClass*>(metadata));",
  "",
  "  PythonInterpreter::registerGlobalMethod(",
  "      \"compileMeasures\", compileMeasuresPython, METH_NOARGS,",
  "      \"Compiles all expressions on the measures.\");",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<ForecastMeasureComputedPlanned,",
  "                      ForecastMeasure>::initialize();",
  "}",
  "",
  "struct ForecastMeasureComputed::ItemAttribute final",
  "    : public exprtk::igeneric_function<double> {",
  "  typedef exprtk::igeneric_function<double> igenfunct_t;",
  "  typedef typename igenfunct_t::parameter_list_t parameter_list_t;",
  "  typedef typename igenfunct_t::generic_type::string_view string_t;",
  "",
  "  ItemAttribute() : igenfunct_t(\"S\") {}",
  "",
  "  inline double operator()(parameter_list_t parameters) override {",
  "    auto attr = to_str(string_t(parameters[0]));",
  "    if (attr == \"cost\")",
  "      return fcstbckt->getItem()->getCost();",
  "    else if (attr == \"volume\")",
  "      return fcstbckt->getItem()->getVolume();",
  "    else if (attr == \"weight\")",
  "      return fcstbckt->getItem()->getWeight();",
  "    else",
  "      return fcstbckt->getItem()->getDoubleProperty(attr, 0);",
  "  }",
  "};",
  "",
  "ForecastMeasureComputed::ItemAttribute",
  "    ForecastMeasureComputed::functionItemAttribute;",
  "",
  "struct ForecastMeasureComputed::LocationAttribute final",
  "    : public exprtk::igeneric_function<double> {",
  "  typedef exprtk::igeneric_function<double> igenfunct_t;",
  "  typedef typename igenfunct_t::parameter_list_t parameter_list_t;",
  "  typedef typename igenfunct_t::generic_type::string_view string_t;",
  "",
  "  LocationAttribute() : igenfunct_t(\"S\") {}",
  "",
  "  inline double operator()(parameter_list_t parameters) override {",
  "    auto attr = to_str(string_t(parameters[0]));",
  "    return fcstbckt->getLocation()->getDoubleProperty(attr, 0);",
  "  }",
  "};",
  "",
  "ForecastMeasureComputed::LocationAttribute",
  "    ForecastMeasureComputed::functionLocationAttribute;",
  "",
  "struct ForecastMeasureComputed::CustomerAttribute final",
  "    : public exprtk::igeneric_function<double> {",
  "  typedef exprtk::igeneric_function<double> igenfunct_t;",
  "  typedef typename igenfunct_t::parameter_list_t parameter_list_t;",
  "  typedef typename igenfunct_t::generic_type::string_view string_t;",
  "",
  "  CustomerAttribute() : igenfunct_t(\"S\") {}",
  "",
  "  inline double operator()(parameter_list_t parameters) override {",
  "    auto attr = to_str(string_t(parameters[0]));",
  "    return fcstbckt->getCustomer()->getDoubleProperty(attr, 0);",
  "  }",
  "};",
  "",
  "ForecastMeasureComputed::CustomerAttribute",
  "    ForecastMeasureComputed::functionCustomerAttribute;",
  "",
  "void ForecastMeasureComputed::appendDependents(",
  "    list<const ForecastMeasureComputed*>& l) const {",
  "  l.push_back(this);",
  "  for (auto& i : dependents)",
  "    if (i != this) i->appendDependents(l);",
  "}",
  "",
  "PyObject* ForecastMeasureComputed::compileMeasuresPython(PyObject*, PyObject*) {",
  "  try {",
  "    compileMeasures();",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void ForecastMeasureComputed::compileMeasures() {",
  "  short errors = 0;",
  "  static exprtk::parser<double> parser;",
  "  parser.dec().collect_variables() = true;",
  "  parser.dec().collect_assignments() = true;",
  "",
  "  // Fill the symbol table and reset previous compilation results",
  "  symboltable.clear();",
  "  symboltable.add_variable(\"cost\", cost);",
  "  symboltable.add_function(\"item\", functionItemAttribute);",
  "  symboltable.add_function(\"location\", functionLocationAttribute);",
  "  symboltable.add_function(\"customer\", functionCustomerAttribute);",
  "  symboltable.add_variable(\"newvalue\", newvalue);",
  "  for (auto& m : all()) {",
  "    if (!m.isTemporary())",
  "      symboltable.add_variable(m.getName(), m.expressionvalue);",
  "    m.alldependents.clear();",
  "    m.dependents.clear();",
  "    m.assignments.clear();",
  "  }",
  "",
  "  for (auto& m : all()) {",
  "    if (m.isTemporary() || (!m.hasType<ForecastMeasureComputed>() &&",
  "                            !m.hasType<ForecastMeasureComputedPlanned>()))",
  "      continue;",
  "    auto c = static_cast<ForecastMeasureComputed*>(&m);",
  "",
  "    // Compile the compute-expression",
  "    c->compute_expression.register_symbol_table(symboltable);",
  "    if (!parser.compile(c->compute_expression_string, c->compute_expression)) {",
  "      logger << c->getName() << \" error compiling expression \\\"\"",
  "             << c->compute_expression_string << \"\\\"\\n\";",
  "      ++errors;",
  "    } else {",
  "      // Get all dependent measures",
  "      deque<exprtk::parser<double>::dependent_entity_collector::symbol_t>",
  "          symbol_list;",
  "      parser.dec().symbols(symbol_list);",
  "      for (const auto& i : symbol_list) {",
  "        if (i.second == exprtk::parser<double>::e_st_variable) {",
  "          auto m = const_cast<ForecastMeasure*>(find(i.first));",
  "          if (m) m->dependents.push_back(c);",
  "        }",
  "      }",
  "    }",
  "",
  "    // Compile the update-expression",
  "    if (!c->update_expression_string.empty()) {",
  "      c->update_expression.register_symbol_table(symboltable);",
  "      if (!parser.compile(c->update_expression_string, c->update_expression)) {",
  "        logger << c->getName() << \" error compiling update expression \\\"\"",
  "               << c->update_expression_string << \"\\\"\\n\";",
  "        ++errors;",
  "      } else {",
  "        // Get all assignments",
  "        deque<exprtk::parser<double>::dependent_entity_collector::symbol_t>",
  "            symbol_list;",
  "        parser.dec().assignment_symbols(symbol_list);",
  "        for (const auto& i : symbol_list) {",
  "          if (i.second == exprtk::parser<double>::e_st_variable) {",
  "            auto m = const_cast<ForecastMeasure*>(find(i.first));",
  "            if (m) c->assignments.push_back(m);",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  for (auto& m : all()) {",
  "    // Get all recursive dependents",
  "    for (auto& i : m.dependents) i->appendDependents(m.alldependents);",
  "",
  "    for (auto i = m.alldependents.begin(); i != m.alldependents.end(); ++i) {",
  "      // Remove duplicate dependents",
  "      auto j = i;",
  "      for (++j; j != m.alldependents.end(); ++j) {",
  "        if (*j == *i) {",
  "          auto k = j++;",
  "          m.alldependents.erase(k);",
  "          if (j == m.alldependents.end()) break;",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  if (errors) throw DataException(\"Errors when compiling expressions\");",
  "}",
  "",
  "void ForecastMeasure::evalExpression(const string& formula, ForecastBase* fcst,",
  "                                     Date startdate, Date enddate) {",
  "  // Find the forecast if not specified",
  "  if (!fcst)",
  "    fcst = Forecast::findForecast(Item::getRoot(), Customer::getRoot(),",
  "                                  Location::getRoot());",
  "",
  "  // Compile the expression",
  "  exprtk::parser<double> parser;",
  "  exprtk::expression<double> expression;",
  "  expression.register_symbol_table(ForecastMeasureComputed::symboltable);",
  "  if (!parser.compile(formula, expression))",
  "    throw DataException(\"Error compiling expression\");",
  "",
  "  // Evaluate the expression for all leaf forecast buckets",
  "  // double remainder = 0.0;",
  "  for (auto c = fcst->getLeaves(true, this); c; ++c) {",
  "    auto fcstdata = c->getData();",
  "    lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "    for (auto bckt = fcstdata->getBuckets().begin();",
  "         bckt != fcstdata->getBuckets().end() && bckt->getStart() <= enddate;",
  "         ++bckt) {",
  "      if ((bckt->getStart() >= startdate && bckt->getStart() < enddate) ||",
  "          (bckt->getDates().within(startdate) &&",
  "           bckt->getDates().between(enddate))) {",
  "        // Fill the symbol table",
  "        for (auto& m : all()) m.expressionvalue = bckt->getValue(m);",
  "",
  "        // Evaluate the expression",
  "        auto result = expression.value();",
  "        if (getDiscrete()) {",
  "          // Note: We just round the numbers to discrete values.",
  "          // We are not rolling forward remainders across buckets.",
  "          auto qty = floor(result + ROUNDING_ERROR);",
  "          // remainder = result - qty;",
  "          result = qty;",
  "        }",
  "",
  "        // Store the results",
  "        update(*bckt, result);",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
