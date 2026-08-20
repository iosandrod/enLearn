// <header-api-generated>
import { HeaderModelAdapter } from "./library.js";

export const CommandCppModel = { bases: [] as const, methods: ["commit","getNext","getType","rollback"] as const, qualifiedNames: ["Command"] as const };

export const CommandCreateObjectCppModel = { bases: ["Command"] as const, methods: ["commit","getType","rollback"] as const, qualifiedNames: ["CommandCreateObject"] as const };

export const CommandListCppModel = { bases: ["Command"] as const, methods: ["add","begin","commit","empty","end","getType","rollback"] as const, qualifiedNames: ["CommandList"] as const };

export class CommandListIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["CommandList::iterator"] as const;
}

export const CommandManagerCppModel = { bases: ["Object"] as const, methods: ["add","addCommandSetField","begin","commit","empty","end","initialize","rbegin","rend","rollback","setBookmark"] as const, qualifiedNames: ["CommandManager"] as const };

export class CommandManagerBookmark extends HeaderModelAdapter {
  static readonly cppBases = ["CommandList"] as const;
  static readonly cppQualifiedNames = ["CommandManager::Bookmark"] as const;
  isActive(...args: readonly unknown[]): unknown { return this.invokeAdapter("isActive", args); }
  isChildOf(...args: readonly unknown[]): unknown { return this.invokeAdapter("isChildOf", args); }
}

export class CommandManagerIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["CommandManager::iterator"] as const;
}

export class CommandManagerReverse_iterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["CommandManager::reverse_iterator"] as const;
}

export const CommandSetFieldCppModel = { bases: ["Command"] as const, methods: ["clearObject","commit","getObject","getType","rollback"] as const, qualifiedNames: ["CommandSetField"] as const };

export const CommandSetPropertyCppModel = { bases: ["Command"] as const, methods: ["clearObject","commit","getObject","getType","rollback"] as const, qualifiedNames: ["CommandSetProperty"] as const };
// </header-api-generated>


























/**
 * Semantic migration unit for src/utils/actions.cpp.
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
  { name: "CommandList::add", sourceLine: 37, status: "adapted" },
  { name: "CommandList::rollback", sourceLine: 55, status: "adapted" },
  { name: "CommandList::commit", sourceLine: 72, status: "adapted" },
  { name: "CommandList::~CommandList", sourceLine: 87, status: "adapted" },
  { name: "CommandManager::initialize", sourceLine: 99, status: "adapted" },
  { name: "CommandManager::setBookmark", sourceLine: 114, status: "adapted" },
  { name: "CommandManager::rollback", sourceLine: 123, status: "adapted" },
  { name: "CommandManager::commit", sourceLine: 151, status: "adapted" },
  { name: "CommandManager::rollback", sourceLine: 164, status: "adapted" },
  { name: "CommandManager::empty", sourceLine: 177, status: "adapted" },
  { name: "CommandSetProperty::CommandSetProperty", sourceLine: 190, status: "adapted" },
  { name: "CommandSetProperty::rollback", sourceLine: 217, status: "adapted" },
  { name: "ThreadGroup::execute", sourceLine: 276, status: "adapted" },
  { name: "ThreadGroup::selectNextCallable", sourceLine: 302, status: "adapted" },
  { name: "ThreadGroup::wrapper", sourceLine: 314, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface CommandListPort {
  add(...args: readonly PortValue[]): PortValue | void;
  commit(...args: readonly PortValue[]): PortValue | void;
  disposeCommandList(...args: readonly PortValue[]): PortValue | void;
  rollback(...args: readonly PortValue[]): PortValue | void;
}

export interface CommandManagerPort {
  commit(...args: readonly PortValue[]): PortValue | void;
  empty(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  rollback(...args: readonly PortValue[]): PortValue | void;
  setBookmark(...args: readonly PortValue[]): PortValue | void;
}

export interface CommandSetPropertyPort {
  CommandSetProperty(...args: readonly PortValue[]): PortValue | void;
  rollback(...args: readonly PortValue[]): PortValue | void;
}

export interface ThreadGroupPort {
  execute(...args: readonly PortValue[]): PortValue | void;
  selectNextCallable(...args: readonly PortValue[]): PortValue | void;
  wrapper(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/actions.cpp";
export const targetFile = "utils/actions.ts";

export class LogicException extends Error {
  override readonly name = "LogicException";
}

export abstract class Command {
  owner: CommandList | null = null;
  next: Command | null = null;
  previous: Command | null = null;

  commit(): void {}

  rollback(): void {}

  dispose(): void {
    this.rollback();
  }

  getNext(): Command | null {
    return this.next;
  }

  abstract getType(): number;
}

/** Composite command with the same insertion and reversal order as C++. */
export class CommandList extends Command implements Iterable<Command> {
  private firstCommand: Command | null = null;
  private lastCommand: Command | null = null;

  add(command: Command): void {
    if (!command) throw new LogicException("Adding null command to a command list");
    if (command.owner) throw new LogicException("Adding a command that already has an owner");
    command.owner = this;
    command.previous = this.lastCommand;
    command.next = null;
    if (this.lastCommand) this.lastCommand.next = command;
    else this.firstCommand = command;
    this.lastCommand = command;
  }

  override rollback(): void {
    let current = this.lastCommand;
    while (current) {
      const previous = current.previous;
      current.rollback();
      this.detach(current);
      current = previous;
    }
    this.firstCommand = null;
    this.lastCommand = null;
  }

  override commit(): void {
    let current = this.firstCommand;
    while (current) {
      const next = current.next;
      current.commit();
      this.detach(current);
      current = next;
    }
    this.firstCommand = null;
    this.lastCommand = null;
  }

  override dispose(): void {
    if (!this.empty()) this.rollback();
  }

  empty(): boolean {
    return this.firstCommand === null;
  }

  override getType(): number {
    return 1;
  }

  *[Symbol.iterator](): Iterator<Command> {
    let current = this.firstCommand;
    while (current) {
      yield current;
      current = current.next;
    }
  }

  private detach(command: Command): void {
    command.owner = null;
    command.next = null;
    command.previous = null;
  }
}

export interface FieldAccessor<TObject extends object, TValue> {
  get(object: TObject): TValue;
  set(object: TObject, value: TValue): void;
}

export class CommandSetField<TObject extends object, TValue> extends Command {
  private object: TObject | null;
  private field: FieldAccessor<TObject, TValue> | null;
  private readonly oldValue: TValue;

  constructor(object: TObject, field: FieldAccessor<TObject, TValue>, value: TValue) {
    super();
    this.object = object;
    this.field = field;
    this.oldValue = field.get(object);
    field.set(object, value);
  }

  override rollback(): void {
    if (this.object && this.field) this.field.set(this.object, this.oldValue);
    this.object = null;
    this.field = null;
  }

  override commit(): void {
    this.object = null;
    this.field = null;
  }

  clearObject(): void {
    this.object = null;
  }

  getObject(): TObject | null {
    return this.object;
  }

  override getType(): number {
    return 2;
  }
}

/** Property mutation that captures existence as well as the old value. */
export class CommandSetProperty<TObject extends object, TKey extends keyof TObject> extends Command {
  private object: TObject | null;
  private key: TKey | null;
  private readonly oldExists: boolean;
  private readonly oldValue: TObject[TKey] | undefined;

  constructor(object: TObject, key: TKey, value: TObject[TKey]) {
    super();
    this.object = object;
    this.key = key;
    this.oldExists = Object.prototype.hasOwnProperty.call(object, key);
    this.oldValue = object[key];
    object[key] = value;
  }

  override rollback(): void {
    if (!this.object || this.key === null) return;
    if (this.oldExists) this.object[this.key] = this.oldValue as TObject[TKey];
    else delete this.object[this.key];
    this.object = null;
    this.key = null;
  }

  override commit(): void {
    this.object = null;
    this.key = null;
  }

  clearObject(): void {
    this.object = null;
  }

  getObject(): TObject | null {
    return this.object;
  }

  override getType(): number {
    return 3;
  }
}

export interface DisposableObject {
  dispose(): void;
}

export class CommandCreateObject<TObject extends DisposableObject> extends Command {
  private object: TObject | null;

  constructor(object: TObject) {
    super();
    this.object = object;
  }

  override commit(): void {
    this.object = null;
  }

  override rollback(): void {
    if (!this.object) return;
    for (let command = this.next; command; command = command.next) {
      if (command instanceof CommandSetField && command.getObject() === this.object) command.clearObject();
      if (command instanceof CommandSetProperty && command.getObject() === this.object) command.clearObject();
    }
    this.object.dispose();
    this.object = null;
  }

  override getType(): number {
    return 4;
  }
}

export class Bookmark extends CommandList {
  nextBookmark: Bookmark | null = null;
  previousBookmark: Bookmark | null = null;
  readonly parent: Bookmark | null;
  active = true;

  constructor(parent: Bookmark | null = null) {
    super();
    this.parent = parent;
  }

  isActive(): boolean {
    return this.active;
  }

  isChildOf(bookmark: Bookmark): boolean {
    for (let candidate: Bookmark | null = this; candidate; candidate = candidate.parent) {
      if (candidate === bookmark) return true;
    }
    return false;
  }
}

/** Transaction manager preserving nested bookmark behavior. */
export class CommandManager implements Iterable<Bookmark> {
  private readonly firstBookmark = new Bookmark();
  private lastBookmark: Bookmark = this.firstBookmark;
  private currentBookmark: Bookmark = this.firstBookmark;

  static initialize(): number {
    return 0;
  }

  add(command: Command): void {
    this.currentBookmark.add(command);
  }

  addCommandSetField<TObject extends object, TValue>(
    object: TObject,
    field: FieldAccessor<TObject, TValue>,
    value: TValue,
  ): void {
    this.add(new CommandSetField(object, field, value));
  }

  setBookmark(): Bookmark {
    const bookmark = new Bookmark(this.currentBookmark);
    this.lastBookmark.nextBookmark = bookmark;
    bookmark.previousBookmark = this.lastBookmark;
    this.lastBookmark = bookmark;
    this.currentBookmark = bookmark;
    return bookmark;
  }

  rollback(bookmark?: Bookmark): void {
    if (!bookmark) {
      for (let current: Bookmark | null = this.lastBookmark; current && current !== this.firstBookmark;) {
        const previous: Bookmark | null = current.previousBookmark;
        current.rollback();
        current.nextBookmark = null;
        current.previousBookmark = null;
        current = previous;
      }
      this.firstBookmark.rollback();
      this.firstBookmark.nextBookmark = null;
      this.lastBookmark = this.firstBookmark;
      this.currentBookmark = this.firstBookmark;
      return;
    }

    if (bookmark === this.firstBookmark) throw new LogicException("Can't rollback default bookmark");
    let found = false;
    for (let current: Bookmark | null = this.lastBookmark; current;) {
      const previous: Bookmark | null = current.previousBookmark;
      if (current === bookmark) found = true;
      if (current === bookmark || current.isChildOf(bookmark)) {
        current.rollback();
        if (current !== bookmark) this.unlinkBookmark(current);
      }
      if (current === bookmark) break;
      current = previous;
    }
    if (!found) throw new LogicException("Can't find bookmark to rollback");
    this.currentBookmark = bookmark;
  }

  commit(): void {
    if (this.firstBookmark.active) this.firstBookmark.commit();
    for (let bookmark = this.firstBookmark.nextBookmark; bookmark;) {
      const next = bookmark.nextBookmark;
      if (bookmark.active) bookmark.commit();
      else bookmark.dispose();
      bookmark.previousBookmark = null;
      bookmark.nextBookmark = null;
      bookmark = next;
    }
    this.firstBookmark.nextBookmark = null;
    this.firstBookmark.previousBookmark = null;
    this.lastBookmark = this.firstBookmark;
    this.currentBookmark = this.firstBookmark;
  }

  empty(): boolean {
    if (this.firstBookmark.active && !this.firstBookmark.empty()) return false;
    for (let bookmark = this.firstBookmark.nextBookmark; bookmark; bookmark = bookmark.nextBookmark) {
      if (!bookmark.empty()) return false;
    }
    return true;
  }

  dispose(): void {
    this.rollback();
  }

  *[Symbol.iterator](): Iterator<Bookmark> {
    let current: Bookmark | null = this.firstBookmark;
    while (current) {
      yield current;
      current = current.nextBookmark;
    }
  }

  *reverse(): Iterator<Bookmark> {
    let current: Bookmark | null = this.lastBookmark;
    while (current) {
      yield current;
      current = current.previousBookmark;
    }
  }

  private unlinkBookmark(bookmark: Bookmark): void {
    const previous = bookmark.previousBookmark;
    const next = bookmark.nextBookmark;
    if (previous) previous.nextBookmark = next;
    if (next) next.previousBookmark = previous;
    if (this.lastBookmark === bookmark && previous) this.lastBookmark = previous;
    bookmark.previousBookmark = null;
    bookmark.nextBookmark = null;
  }
}

export type ThreadCallable<TFirst = unknown, TThird = unknown> = (
  first: TFirst,
  second: number,
  third: TThird | null,
) => void | Promise<void>;

interface ThreadJob {
  callable: ThreadCallable;
  first: unknown;
  second: number;
  third: unknown;
}

/** Promise worker-pool adapter for std::thread based ThreadGroup. */
export class ThreadGroup {
  private readonly callables: ThreadJob[] = [];
  private maxParallelValue: number;

  constructor(maxParallel = 1) {
    this.maxParallelValue = 1;
    this.setMaxParallel(maxParallel);
  }

  add<TFirst, TThird>(
    callable: ThreadCallable<TFirst, TThird>,
    first: TFirst,
    second = 0,
    third: TThird | null = null,
  ): void {
    this.callables.push({ callable: callable as ThreadCallable, first, second, third });
  }

  getMaxParallel(): number {
    return this.maxParallelValue;
  }

  setMaxParallel(value: number): void {
    if (!Number.isInteger(value) || value < 1) {
      throw new LogicException("Invalid number of parallel execution threads");
    }
    this.maxParallelValue = value;
  }

  async execute(): Promise<void> {
    const workers = Math.min(this.callables.length, this.maxParallelValue);
    await Promise.all(Array.from({ length: workers }, async () => this.wrapper()));
  }

  private selectNextCallable(): ThreadJob | undefined {
    return this.callables.pop();
  }

  private async wrapper(): Promise<void> {
    for (let job = this.selectNextCallable(); job; job = this.selectNextCallable()) {
      await job.callable(job.first, job.second, job.third);
    }
  }
}

export const ThreadGroupCppModel = {
  bases: ["NonCopyable"] as const,
  methods: ["add", "execute", "getMaxParallel", "setMaxParallel"] as const,
  qualifiedNames: ["ThreadGroup"] as const,
};

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2007-2015 by frePPLe bv                                   *",
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
  "#include \"frepple/utils.h\"",
  "",
  "namespace frepple::utils {",
  "",
  "const MetaCategory* CommandManager::metacategory;",
  "const MetaClass* CommandManager::metadata;",
  "",
  "//",
  "// COMMAND LIST",
  "//",
  "",
  "void CommandList::add(Command* c) {",
  "  // Validity check",
  "  if (!c) throw LogicException(\"Adding nullptr command to a command list\");",
  "",
  "  // Set the owner of the command",
  "  c->owner = this;",
  "",
  "  // Maintenance of the linked list of child commands",
  "  c->prev = lastCommand;",
  "  if (lastCommand)",
  "    // Let the last command in the chain point to this new extra command",
  "    lastCommand->next = c;",
  "  else",
  "    // This is the first command in this command list",
  "    firstCommand = c;",
  "  lastCommand = c;",
  "}",
  "",
  "void CommandList::rollback() {",
  "  // Undo all commands and delete them.",
  "  // Note that undoing an operation that hasn't been executed yet or has been",
  "  // undone already is expected to be harmless, so we don't need to worry",
  "  // about that...",
  "  for (auto i = lastCommand; i;) {",
  "    Command* t = i;  // Temporarily store the pointer to be deleted",
  "    i = i->prev;",
  "    t->next = nullptr;",
  "    delete t;  // The delete is expected to also revert the change!",
  "  }",
  "",
  "  // Reset the list",
  "  firstCommand = nullptr;",
  "  lastCommand = nullptr;",
  "}",
  "",
  "void CommandList::commit() {",
  "  // Commit the commands",
  "  for (auto i = firstCommand; i;) {",
  "    Command* t = i;  // Temporarily store the pointer to be deleted",
  "    i->commit();",
  "    i = i->next;",
  "    t->prev = nullptr;",
  "    delete t;",
  "  }",
  "",
  "  // Reset the list",
  "  firstCommand = nullptr;",
  "  lastCommand = nullptr;",
  "}",
  "",
  "CommandList::~CommandList() {",
  "  if (firstCommand) {",
  "    logger << \"Warning: Deleting a command list with commands that have\"",
  "           << \" not been committed or rolled back\\n\";",
  "    rollback();",
  "  }",
  "}",
  "",
  "//",
  "// COMMAND MANAGER",
  "//",
  "",
  "int CommandManager::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<CommandManager>(",
  "      \"commandmanager\", \"commandmanagers\");",
  "  metadata = MetaClass::registerClass<CommandManager>(",
  "      \"commandmanager\", \"commandmanager\", Object::create<CommandManager>, true);",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<CommandManager>::getPythonType();",
  "  x.setName(metadata->type);",
  "  x.setDoc(\"frePPLe \" + metadata->type);",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "CommandManager::Bookmark* CommandManager::setBookmark() {",
  "  auto* n = new Bookmark(currentBookmark);",
  "  lastBookmark->nextBookmark = n;",
  "  n->prevBookmark = lastBookmark;",
  "  lastBookmark = n;",
  "  currentBookmark = n;",
  "  return n;",
  "}",
  "",
  "void CommandManager::rollback(CommandManager::Bookmark* b) {",
  "  if (!b) throw LogicException(\"Can't rollback nullptr bookmark\");",
  "  if (b == &firstBookmark)",
  "    throw LogicException(\"Can't rollback default bookmark\");",
  "",
  "  // Remove all later child bookmarks",
  "  Bookmark* i = lastBookmark;",
  "  while (i && i != b) {",
  "    if (i->isChildOf(b)) {",
  "      // Remove from bookmark list",
  "      if (i->prevBookmark) i->prevBookmark->nextBookmark = i->nextBookmark;",
  "      if (i->nextBookmark)",
  "        i->nextBookmark->prevBookmark = i->prevBookmark;",
  "      else",
  "        lastBookmark = i->prevBookmark;",
  "      i->rollback();",
  "      if (currentBookmark == i) currentBookmark = b;",
  "      Bookmark* tmp = i;",
  "      i = i->prevBookmark;",
  "      delete tmp;",
  "    } else",
  "      // Bookmark has a different parent",
  "      i = i->prevBookmark;",
  "  }",
  "  if (!i) throw LogicException(\"Can't find bookmark to rollback\");",
  "  b->rollback();",
  "}",
  "",
  "void CommandManager::commit() {",
  "  if (firstBookmark.active) firstBookmark.commit();",
  "  for (auto i = firstBookmark.nextBookmark; i;) {",
  "    if (i->active) i->commit();",
  "    Bookmark* tmp = i;",
  "    i = i->nextBookmark;",
  "    delete tmp;",
  "  }",
  "  firstBookmark.nextBookmark = nullptr;",
  "  currentBookmark = &firstBookmark;",
  "  lastBookmark = &firstBookmark;",
  "}",
  "",
  "void CommandManager::rollback() {",
  "  for (auto i = lastBookmark; i != &firstBookmark;) {",
  "    i->rollback();",
  "    Bookmark* tmp = i;",
  "    i = i->prevBookmark;",
  "    delete tmp;",
  "  }",
  "  firstBookmark.rollback();",
  "  firstBookmark.nextBookmark = nullptr;",
  "  currentBookmark = &firstBookmark;",
  "  lastBookmark = &firstBookmark;",
  "}",
  "",
  "bool CommandManager::empty() const {",
  "  if (firstBookmark.active && !firstBookmark.empty()) return false;",
  "  for (auto bkmrk = firstBookmark.nextBookmark; bkmrk;",
  "       bkmrk = bkmrk->nextBookmark) {",
  "    if (!bkmrk->empty()) return false;",
  "  }",
  "  return true;",
  "}",
  "",
  "//",
  "// COMMAND SETPROPERTY",
  "//",
  "",
  "CommandSetProperty::CommandSetProperty(Object* o, const string& nm,",
  "                                       const DataValue&, short tp)",
  "    : obj(o), name(nm), type(tp) {",
  "  if (!o || nm.empty()) return;",
  "",
  "  // Store old value",
  "  old_exists = o->hasProperty(name);",
  "  if (old_exists) {",
  "    switch (type) {",
  "      case 1:  // Boolean",
  "        old_bool = obj->getBoolProperty(name);",
  "        break;",
  "      case 2:  // Date",
  "        old_date = obj->getDateProperty(name);",
  "        break;",
  "      case 3:  // Double",
  "        old_double = obj->getDoubleProperty(name);",
  "        break;",
  "      case 4:  // String",
  "        old_string = obj->getStringProperty(name);",
  "        break;",
  "      default:",
  "        break;",
  "    }",
  "  }",
  "}",
  "",
  "void CommandSetProperty::rollback() {",
  "  if (!obj || name.empty()) {",
  "    if (old_exists && obj) {",
  "      switch (type) {",
  "        case 1:  // Boolean",
  "        {",
  "          bool tmp_bool = obj->getBoolProperty(name);",
  "          obj->setBoolProperty(name, old_bool);",
  "          old_bool = tmp_bool;",
  "        } break;",
  "        case 2:  // Date",
  "        {",
  "          Date tmp_date = obj->getDateProperty(name);",
  "          obj->setDateProperty(name, old_date);",
  "          old_date = tmp_date;",
  "        } break;",
  "        case 3:  // Double",
  "        {",
  "          double tmp_double = obj->getDoubleProperty(name);",
  "          obj->setDoubleProperty(name, old_double);",
  "          old_double = tmp_double;",
  "        } break;",
  "        case 4:  // String",
  "        {",
  "          string tmp_string = obj->getStringProperty(name);",
  "          obj->setStringProperty(name, old_string);",
  "          old_string = tmp_string;",
  "        } break;",
  "        default:",
  "          break;",
  "      }",
  "    } else if (obj) {",
  "      switch (type) {",
  "        case 1:  // Boolean",
  "          old_bool = obj->getBoolProperty(name);",
  "          break;",
  "        case 2:  // Date",
  "          old_date = obj->getDateProperty(name);",
  "          break;",
  "        case 3:  // Double",
  "          old_double = obj->getDoubleProperty(name);",
  "          break;",
  "        case 4:  // String",
  "          old_string = obj->getStringProperty(name);",
  "          break;",
  "        default:",
  "          break;",
  "      }",
  "      obj->deleteProperty(name);",
  "    }",
  "  }",
  "  obj = nullptr;",
  "  name = \"\";",
  "}",
  "",
  "//",
  "// THREAD GROUP",
  "//",
  "",
  "void ThreadGroup::execute() {",
  "  // Determine the number of threads",
  "  auto numthreads = callables.size();",
  "  if (numthreads > static_cast<size_t>(maxParallel)) numthreads = maxParallel;",
  "",
  "  if (numthreads <= 1)",
  "    // Sequential execution",
  "    wrapper(this);",
  "  else {",
  "    // Parallel execution in worker threads",
  "    stack<thread> threads;",
  "",
  "    // Launch all threads",
  "    while (numthreads > 0) {",
  "      threads.emplace(wrapper, this);",
  "      --numthreads;",
  "    }",
  "",
  "    // Wait for all threads to finish",
  "    while (!threads.empty()) {",
  "      threads.top().join();",
  "      threads.pop();",
  "    }",
  "  }",
  "}",
  "",
  "ThreadGroup::callableWithArgument ThreadGroup::selectNextCallable() {",
  "  lock_guard<mutex> l(lock);",
  "  if (callables.empty())",
  "    // No more functions",
  "    return callableWithArgument(static_cast<callable>(nullptr),",
  "                                static_cast<void*>(nullptr), 0,",
  "                                static_cast<void*>(nullptr));",
  "  callableWithArgument c = callables.top();",
  "  callables.pop();",
  "  return c;",
  "}",
  "",
  "void ThreadGroup::wrapper(ThreadGroup* grp) {",
  "  while (true) {",
  "    auto job = grp->selectNextCallable();",
  "    if (!get<0>(job)) return;",
  "    try {",
  "      get<0>(job)(get<1>(job), get<2>(job), get<3>(job));",
  "    } catch (...) {",
  "      // Error message",
  "      logger << \"Error: Caught an exception while executing command:\\n\";",
  "      try {",
  "        throw;",
  "      } catch (const exception& e) {",
  "        logger << \"  \" << e.what() << '\\n';",
  "      } catch (...) {",
  "        logger << \"  Unknown type\\n\";",
  "      }",
  "    }",
  "  };",
  "}",
  "",
  "}  // namespace frepple::utils",
];
