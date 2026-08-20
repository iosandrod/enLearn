// <header-api-generated>
export const AbstractCacheEntryCppModel = { bases: [] as const, methods: ["clearDirty","isDirty","markDirty"] as const, qualifiedNames: ["AbstractCacheEntry"] as const };

export const CacheCppModel = { bases: ["Object"] as const, methods: ["checkIntegrity","clear","clearDirty","flush","getInstance","getLogLevel","getMaximum","getStatus","getThreads","getType","getWriteImmediately","initialize","printStatus","pythonClear","pythonFlush","pythonPrintStatus","registerFields","setLogLevel","setMaximum","setThreads","setWriteImmediately","setWriteImmediately2"] as const, qualifiedNames: ["Cache"] as const };

export const CacheEntryCppModel = { bases: ["AbstractCacheEntry"] as const, methods: ["clearDirty","expire","flush","getLock","getSize","getValue"] as const, qualifiedNames: ["CacheEntry"] as const };
// </header-api-generated>























/**
 * Semantic migration unit for src/utils/cache.cpp.
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
  { name: "Cache::tag_write_immediately", sourceLine: 39, status: "adapted" },
  { name: "Cache::tag_threads", sourceLine: 40, status: "adapted" },
  { name: "Cache::initialize", sourceLine: 42, status: "adapted" },
  { name: "Cache::pythonFlush", sourceLine: 70, status: "adapted" },
  { name: "Cache::flush", sourceLine: 84, status: "adapted" },
  { name: "Cache::pythonClear", sourceLine: 99, status: "adapted" },
  { name: "Cache::clear", sourceLine: 113, status: "adapted" },
  { name: "Cache::clearDirty", sourceLine: 128, status: "adapted" },
  { name: "AbstractCacheEntry::moveToFront", sourceLine: 143, status: "adapted" },
  { name: "AbstractCacheEntry::insertAtFront", sourceLine: 182, status: "adapted" },
  { name: "AbstractCacheEntry::removeFromCache", sourceLine: 207, status: "adapted" },
  { name: "Cache::pythonPrintStatus", sourceLine: 259, status: "adapted" },
  { name: "Cache::setThreads", sourceLine: 273, status: "adapted" },
  { name: "Cache::printStatus", sourceLine: 299, status: "adapted" },
  { name: "AbstractCacheEntry::markDirty", sourceLine: 306, status: "adapted" },
  { name: "AbstractCacheEntry::clearDirty", sourceLine: 327, status: "adapted" },
  { name: "Cache::workerthread", sourceLine: 347, status: "adapted" },
  { name: "Cache::getStatus", sourceLine: 479, status: "adapted" },
  { name: "Cache::checkIntegrity", sourceLine: 490, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface AbstractCacheEntryPort {
  clearDirty(...args: readonly PortValue[]): PortValue | void;
  insertAtFront(...args: readonly PortValue[]): PortValue | void;
  markDirty(...args: readonly PortValue[]): PortValue | void;
  moveToFront(...args: readonly PortValue[]): PortValue | void;
  removeFromCache(...args: readonly PortValue[]): PortValue | void;
}

export interface CachePort {
  checkIntegrity(...args: readonly PortValue[]): PortValue | void;
  clear(...args: readonly PortValue[]): PortValue | void;
  clearDirty(...args: readonly PortValue[]): PortValue | void;
  flush(...args: readonly PortValue[]): PortValue | void;
  getStatus(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  printStatus(...args: readonly PortValue[]): PortValue | void;
  pythonClear(...args: readonly PortValue[]): PortValue | void;
  pythonFlush(...args: readonly PortValue[]): PortValue | void;
  pythonPrintStatus(...args: readonly PortValue[]): PortValue | void;
  setThreads(...args: readonly PortValue[]): PortValue | void;
  tag_threads(...args: readonly PortValue[]): PortValue | void;
  tag_write_immediately(...args: readonly PortValue[]): PortValue | void;
  workerthread(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/cache.cpp";
export const targetFile = "utils/cache.ts";

import { LogicException } from "./library.js";

export interface Cacheable {
  flush(): void | Promise<void>;
  clearDirty?(): void;
  getSize(): number;
  dispose?(): void;
}

export abstract class AbstractCacheEntry<T extends Cacheable = Cacheable> {
  value: T | null = null;
  prev: AbstractCacheEntry | null = null;
  next: AbstractCacheEntry | null = null;
  prevDirty: AbstractCacheEntry | null = null;
  nextDirty: AbstractCacheEntry | null = null;
  constructor(protected readonly owner: Cache = Cache.getInstance()) {}
  isDirty(): boolean { return this.prevDirty !== null || this.owner.firstDirty === this; }
  markDirty(): void { this.owner.markDirty(this); }
  clearDirty(): void { this.owner.unlinkDirty(this); this.value?.clearDirty?.(); }
  moveToFront(): void { this.owner.moveToFront(this); }
  insertAtFront(): void { this.owner.insertAtFront(this); }
  removeFromCache(): void { this.owner.removeEntry(this); }
  abstract expire(): void;
  abstract flush(): void | Promise<void>;
  abstract getSize(): number;
}

export class CacheEntry<T extends Cacheable, K> extends AbstractCacheEntry<T> {
  constructor(private readonly factory: (key: K) => T, owner?: Cache) { super(owner); }
  getValue(key: K): T {
    if (this.value) { this.owner.recordReadHit(); this.moveToFront(); return this.value; }
    this.owner.recordReadMiss();
    this.value = this.factory(key);
    this.insertAtFront();
    return this.value;
  }
  override expire(): void { this.value?.dispose?.(); this.value = null; }
  override async flush(): Promise<void> { if (this.value) { await this.value.flush(); this.owner.recordWrite(); } }
  override getSize(): number { return this.value?.getSize() ?? 0; }
}

export class Cache {
  private static instance: Cache | null = null;
  firstEntry: AbstractCacheEntry | null = null;
  lastEntry: AbstractCacheEntry | null = null;
  firstDirty: AbstractCacheEntry | null = null;
  private lastDirty: AbstractCacheEntry | null = null;
  private maximum = Number.MAX_SAFE_INTEGER;
  private threads = 1;
  private writeImmediately = true;
  private logLevel = 0;
  private count = 0;
  private reads = 0;
  private misses = 0;
  private writes = 0;
  private processing: Promise<void> | null = null;

  static initialize(): Cache { return this.instance ??= new Cache(); }
  static getInstance(): Cache { return this.instance ??= new Cache(); }
  getMaximum(): number { return this.maximum; }
  setMaximum(value: number): void { if (value > 0) this.maximum = Math.trunc(value); this.schedule(); }
  getThreads(): number { return this.threads; }
  setThreads(value: number): void { this.threads = Math.max(0, Math.trunc(value)); this.schedule(); }
  getWriteImmediately(): boolean { return this.writeImmediately; }
  setWriteImmediately2(value: boolean): void { this.writeImmediately = value; this.schedule(); }
  setWriteImmediately(value: boolean): boolean { const previous = this.writeImmediately; this.setWriteImmediately2(value); return previous; }
  getLogLevel(): number { return this.logLevel; }
  setLogLevel(value: number): void { this.logLevel = value; }
  getStatus(): readonly [number, number] { let size = 0; for (let entry = this.firstEntry; entry; entry = entry.next) size += entry.getSize(); return [this.count, size]; }
  getStatistics(): Readonly<{ reads: number; misses: number; writes: number }> { return { reads: this.reads, misses: this.misses, writes: this.writes }; }
  recordReadHit(): void { this.reads += 1; }
  recordReadMiss(): void { this.reads += 1; this.misses += 1; }
  recordWrite(): void { this.writes += 1; }

  insertAtFront(entry: AbstractCacheEntry): void {
    if (entry.prev || entry.next || this.firstEntry === entry) this.unlinkEntry(entry);
    else this.count += 1;
    entry.prev = null; entry.next = this.firstEntry;
    if (this.firstEntry) this.firstEntry.prev = entry; else this.lastEntry = entry;
    this.firstEntry = entry;
    this.schedule();
  }
  moveToFront(entry: AbstractCacheEntry): void { if (this.firstEntry !== entry) this.insertAtFront(entry); }
  removeEntry(entry: AbstractCacheEntry): void { this.unlinkDirty(entry); if (this.unlinkEntry(entry)) this.count -= 1; entry.expire(); }
  private unlinkEntry(entry: AbstractCacheEntry): boolean {
    if (!entry.prev && !entry.next && this.firstEntry !== entry) return false;
    if (entry.prev) entry.prev.next = entry.next; else this.firstEntry = entry.next;
    if (entry.next) entry.next.prev = entry.prev; else this.lastEntry = entry.prev;
    entry.prev = null; entry.next = null; return true;
  }
  markDirty(entry: AbstractCacheEntry): void {
    if (entry.isDirty()) return;
    entry.prevDirty = this.lastDirty; entry.nextDirty = null;
    if (this.lastDirty) this.lastDirty.nextDirty = entry; else this.firstDirty = entry;
    this.lastDirty = entry; this.schedule();
  }
  unlinkDirty(entry: AbstractCacheEntry): void {
    if (!entry.isDirty()) return;
    if (entry.prevDirty) entry.prevDirty.nextDirty = entry.nextDirty; else this.firstDirty = entry.nextDirty;
    if (entry.nextDirty) entry.nextDirty.prevDirty = entry.prevDirty; else this.lastDirty = entry.prevDirty;
    entry.prevDirty = null; entry.nextDirty = null;
  }
  async flush(): Promise<void> { const previous = this.setWriteImmediately(true); await this.workerthread(); this.setWriteImmediately2(previous); }
  clearDirty(): void { while (this.firstDirty) this.firstDirty.clearDirty(); }
  clear(): void { for (let entry = this.lastEntry; entry;) { const previous = entry.prev; this.removeEntry(entry); entry = previous; } }
  async workerthread(): Promise<void> {
    while (this.firstDirty) { const entry = this.firstDirty; await entry.flush(); entry.clearDirty(); }
    while (this.count > this.maximum && this.lastEntry) { const entry = this.lastEntry; if (entry.isDirty()) { await entry.flush(); entry.clearDirty(); } this.removeEntry(entry); }
  }
  checkIntegrity(): void {
    let count = 0; let previous: AbstractCacheEntry | null = null;
    for (let entry = this.firstEntry; entry; entry = entry.next) { if (entry.prev !== previous) throw new LogicException("Cache entry links are corrupted"); previous = entry; count += 1; }
    if (previous !== this.lastEntry || count !== this.count) throw new LogicException("Cache count is corrupted");
  }
  printStatus(): string { const [count, size] = this.getStatus(); return `Cache objects: ${count}; size: ${size}; reads: ${this.reads}; misses: ${this.misses}; writes: ${this.writes}`; }
  private schedule(): void { if (this.threads <= 0 || (!this.writeImmediately && this.count <= this.maximum)) return; this.processing ??= Promise.resolve().then(() => this.workerthread()).finally(() => { this.processing = null; }); }
}

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2018 by frePPLe bv                                        *",
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
  "#include \"frepple/cache.h\"",
  "",
  "#include \"frepple/utils.h\"",
  "",
  "// Uncomment the line below to enable detailed integrity checks of the cache",
  "// #define DEBUG_CACHE",
  "",
  "namespace frepple::utils {",
  "",
  "Cache* Cache::instance = nullptr;",
  "const MetaClass* Cache::metadata;",
  "const MetaCategory* Cache::metacategory;",
  "",
  "const Keyword Cache::tag_write_immediately(\"write_immediately\");",
  "const Keyword Cache::tag_threads(\"threads\");",
  "",
  "int Cache::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<Cache>(\"cache\", \"\");",
  "  metadata = MetaClass::registerClass<Cache>(\"cache\", \"cache\", true);",
  "  registerFields<Cache>(const_cast<MetaCategory*>(metacategory));",
  "",
  "  // Initialize the Python type",
  "  auto& x = FreppleCategory<Cache>::getPythonType();",
  "  x.setName(\"cache\");",
  "  x.setDoc(\"frePPLe object cache\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"flush\", pythonFlush, METH_NOARGS,",
  "              \"write all objects to the database\");",
  "  x.addMethod(\"clear\", pythonClear, METH_NOARGS,",
  "              \"remove all cached objects from memory\");",
  "  x.addMethod(\"printStatus\", pythonPrintStatus, METH_NOARGS,",
  "              \"print a message on the cache performance\");",
  "  int tmp = x.typeReady();",
  "  metadata->setPythonClass(x);",
  "",
  "  // Initialize the global instance",
  "  instance = new Cache();",
  "  PythonInterpreter::registerGlobalObject(\"cache\", instance);",
  "",
  "  return tmp;",
  "}",
  "",
  "PyObject* Cache::pythonFlush(PyObject* self, PyObject*) {",
  "  auto c = static_cast<Cache*>(self);",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    c->flush();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void Cache::flush() {",
  "  auto prev = setWriteImmediately(true);",
  "  {",
  "    // Wait till the worker threads have written all dirty objects",
  "    unique_lock<mutex> l(lock);",
  "    master_waiting.wait(l, [this] { return this->firstDirty == nullptr; });",
  "  }",
  "  setWriteImmediately(prev);",
  "",
  "#ifdef DEBUG_CACHE",
  "  // Validate things are ok",
  "  Cache::instance->checkIntegrity();",
  "#endif",
  "}",
  "",
  "PyObject* Cache::pythonClear(PyObject* self, PyObject*) {",
  "  auto c = static_cast<Cache*>(self);",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    c->clear();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void Cache::clear() {",
  "  lock_guard<mutex> l(lock);",
  "  for (auto entry = lastEntry; entry; entry = entry->prev)",
  "    entry->val = nullptr;  // Decreases the reference count",
  "  firstDirty = nullptr;",
  "  lastDirty = nullptr;",
  "  firstEntry = nullptr;",
  "  lastEntry = nullptr;",
  "",
  "#ifdef DEBUG_CACHE",
  "  // Validate things are ok",
  "  Cache::instance->checkIntegrity();",
  "#endif",
  "}",
  "",
  "void Cache::clearDirty() {",
  "  while (true) {",
  "    // Find a dirty entry",
  "    AbstractCacheEntry* dirtyentry = nullptr;",
  "    {",
  "      lock_guard<mutex> lk(lock);",
  "      dirtyentry = firstDirty;",
  "    }",
  "    if (!dirtyentry) return;",
  "",
  "    // Clear the dirty flag",
  "    dirtyentry->clearDirty();",
  "  }",
  "}",
  "",
  "void AbstractCacheEntry::moveToFront() const {",
  "  lock_guard<mutex> l(Cache::instance->lock);",
  "  shared_ptr<void> increase_ref_count = val;",
  "#ifdef DEBUG_CACHE",
  "  // Validate things are ok",
  "  Cache::instance->checkIntegrity();",
  "#endif",
  "",
  "  if (Cache::instance->firstEntry == this)",
  "    // Special case: we are already at the front, or already exi",
  "    return;",
  "",
  "  // Unlink from current position",
  "  if (prev || next || Cache::instance->firstEntry == this) {",
  "    if (prev)",
  "      prev->next = next;",
  "    else",
  "      Cache::instance->firstEntry = next;",
  "    if (next)",
  "      next->prev = prev;",
  "    else",
  "      Cache::instance->lastEntry = prev;",
  "  } else",
  "    // Re-inserting anew!",
  "    ++Cache::instance->count;",
  "",
  "  // Link at the front",
  "  const_cast<AbstractCacheEntry*>(this)->next = Cache::instance->firstEntry;",
  "  const_cast<AbstractCacheEntry*>(this)->prev = nullptr;",
  "  if (Cache::instance->firstEntry)",
  "    Cache::instance->firstEntry->prev = const_cast<AbstractCacheEntry*>(this);",
  "  Cache::instance->firstEntry = const_cast<AbstractCacheEntry*>(this);",
  "",
  "#ifdef DEBUG_CACHE",
  "  // Validate things are ok",
  "  Cache::instance->checkIntegrity();",
  "#endif",
  "}",
  "",
  "void AbstractCacheEntry::insertAtFront() const {",
  "  lock_guard<mutex> l(Cache::instance->lock);",
  "  shared_ptr<void> increase_ref_count = val;",
  "  if (Cache::instance->firstEntry) {",
  "    // Other entries are already in the cache",
  "    Cache::instance->firstEntry->prev = const_cast<AbstractCacheEntry*>(this);",
  "    const_cast<AbstractCacheEntry*>(this)->next = Cache::instance->firstEntry;",
  "  } else",
  "    // I am the first entry in the cache",
  "    Cache::instance->lastEntry = const_cast<AbstractCacheEntry*>(this);",
  "  Cache::instance->firstEntry = const_cast<AbstractCacheEntry*>(this);",
  "",
  "  // Increase cache size",
  "  ++Cache::instance->count;",
  "",
  "#ifdef DEBUG_CACHE",
  "  // Validate things are ok",
  "  Cache::instance->checkIntegrity();",
  "#endif",
  "",
  "  // Remove excess objects",
  "  if (Cache::instance->count > Cache::instance->max_objects)",
  "    Cache::instance->work_to_do.notify_all();",
  "}",
  "",
  "void AbstractCacheEntry::removeFromCache() const {",
  "  shared_ptr<void> increase_ref_count = val;",
  "  if (val) {",
  "    // Maintenance of the cache list",
  "    lock_guard<mutex> l(Cache::instance->lock);",
  "",
  "    bool is_dirty = false;",
  "    if (next)",
  "      next->prev = prev;",
  "    else",
  "      Cache::instance->lastEntry = prev;",
  "    if (prev)",
  "      prev->next = next;",
  "    else",
  "      Cache::instance->firstEntry = next;",
  "    --Cache::instance->count;",
  "    const_cast<AbstractCacheEntry*>(this)->val = nullptr;",
  "    if (nextdirty) {",
  "      nextdirty->prevdirty = prevdirty;",
  "      is_dirty = true;",
  "    }",
  "    if (prevdirty) {",
  "      prevdirty->nextdirty = nextdirty;",
  "      is_dirty = true;",
  "    }",
  "    if (Cache::instance->firstDirty == this) {",
  "      Cache::instance->firstDirty = nextdirty;",
  "      is_dirty = true;",
  "    }",
  "    if (Cache::instance->lastDirty == this) {",
  "      Cache::instance->lastDirty = prevdirty;",
  "      is_dirty = true;",
  "    }",
  "",
  "#ifdef DEBUG_CACHE",
  "    // Validate things are ok",
  "    Cache::instance->checkIntegrity();",
  "#endif",
  "",
  "    // Synchronously flush the object if it is dirty",
  "    if (is_dirty) {",
  "      try {",
  "        const_cast<AbstractCacheEntry*>(this)->flush();",
  "      } catch (const exception& e) {",
  "        logger << \"Warning : exception flushing cache: \" << e.what() << '\\n';",
  "      } catch (...) {",
  "        logger << \"Warning : exception flushing cache\\n\";",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "PyObject* Cache::pythonPrintStatus(PyObject* self, PyObject*) {",
  "  auto c = static_cast<Cache*>(self);",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    c->printStatus();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void Cache::setThreads(int i) {",
  "  if (i < 0) {",
  "    logger << \"Warning: Cache thread must be bigger than or equal to 0\\n\";",
  "    return;",
  "  }",
  "  if (i > threads) {",
  "    // Create extra threads",
  "    auto extra = i - threads;",
  "    threads = i;",
  "    while (extra > 0) {",
  "      workers.emplace(workerthread, this, static_cast<int>(workers.size()));",
  "      --extra;",
  "    }",
  "  } else if (i < threads) {",
  "    // Wait for some threads to stop",
  "    auto original = threads;",
  "    threads = i;",
  "    work_to_do.notify_all();",
  "    for (auto c = original - threads; c > 0; --c) {",
  "      auto& thrd = workers.top();",
  "      thrd.join();",
  "      workers.pop();",
  "    }",
  "  }",
  "}",
  "",
  "void Cache::printStatus() {",
  "  logger << \"Cache status:\\n\"",
  "         << \"   \" << count << \" objects (max \" << max_objects << \")\\n\"",
  "         << \"   \" << stats_reads << \" reads and \" << stats_writes << \" writes\"",
  "         << '\\n';",
  "}",
  "",
  "void AbstractCacheEntry::markDirty() {",
  "  shared_ptr<void> increase_ref_count = val;",
  "  lock_guard<mutex> l(Cache::instance->lock);",
  "  if (isDirty()) return;",
  "",
  "  // Update the list of dirty objects",
  "  prevdirty = Cache::instance->lastDirty;",
  "  if (Cache::instance->lastDirty)",
  "    Cache::instance->lastDirty->nextdirty = this;",
  "  else",
  "    Cache::instance->firstDirty = this;",
  "  Cache::instance->lastDirty = this;",
  "",
  "  // can show a mismatch of 1 when marking dirty in constructor",
  "  // assert(Cache::instance->checkIntegrity());",
  "",
  "  // Wake up the writer thread",
  "  if (Cache::instance->writeImmediately)",
  "    Cache::instance->work_to_do.notify_one();",
  "}",
  "",
  "void AbstractCacheEntry::clearDirty() const {",
  "  shared_ptr<void> increase_ref_count = val;",
  "  lock_guard<mutex> l(Cache::instance->lock);",
  "  if (prevdirty)",
  "    prevdirty->nextdirty = nextdirty;",
  "  else",
  "    Cache::instance->firstDirty = nextdirty;",
  "  if (nextdirty)",
  "    nextdirty->prevdirty = prevdirty;",
  "  else",
  "    Cache::instance->lastDirty = prevdirty;",
  "  const_cast<AbstractCacheEntry*>(this)->prevdirty = nullptr;",
  "  const_cast<AbstractCacheEntry*>(this)->nextdirty = nullptr;",
  "",
  "#ifdef DEBUG_CACHE",
  "  // Validate things are ok",
  "  Cache::instance->checkIntegrity();",
  "#endif",
  "}",
  "",
  "void Cache::workerthread(Cache* me, int index) {",
  "  while (index < me->threads) {",
  "    // Wait until are notified about work to do",
  "    {",
  "      unique_lock<mutex> lk(me->lock);",
  "      me->work_to_do.wait(lk, [me, index] {",
  "        return (me->firstDirty && me->writeImmediately) ||",
  "               (me->count > me->max_objects && me->count > 1) ||",
  "               (index >= me->threads);",
  "      });",
  "    }",
  "",
  "    // Define lower cache threshold as 80% of the maximum cache size",
  "    auto threshold = static_cast<unsigned long>(me->max_objects * 0.8);",
  "",
  "    // Determine whether or not we want to reduce the cache size now",
  "    bool reduce_size = me->count > threshold;",
  "",
  "    // Loop over all work to do",
  "    while (index < me->threads) {",
  "      AbstractCacheEntry* entry2delete = nullptr;",
  "      AbstractCacheEntry* entry2flush = nullptr;",
  "",
  "      // Find work to do",
  "      {",
  "        lock_guard<mutex> lk(me->lock);",
  "",
  "#ifdef DEBUG_CACHE",
  "        // Validate things are ok",
  "        Cache::instance->checkIntegrity();",
  "#endif",
  "",
  "        // Expire entries from the upper limit to the lower limit",
  "        while (reduce_size && me->count > threshold) {",
  "          // Find an object that isn't in use",
  "          auto tmp = me->lastEntry;",
  "          while (tmp && tmp->val.use_count() > 1) tmp = tmp->prev;",
  "          if (!tmp)",
  "            // All objects are in use!",
  "            break;",
  "",
  "          // Update cache info",
  "          --me->count;",
  "          if (tmp->next)",
  "            tmp->next->prev = tmp->prev;",
  "          else",
  "            me->lastEntry = tmp->prev;",
  "          if (tmp->prev)",
  "            tmp->prev->next = tmp->next;",
  "          else",
  "            me->firstEntry = tmp->next;",
  "          tmp->prev = nullptr;",
  "          tmp->next = nullptr;",
  "",
  "          if (tmp->isDirty()) {",
  "            // Dirty object to write",
  "            entry2delete = tmp;",
  "            if (tmp->prevdirty)",
  "              tmp->prevdirty->nextdirty = tmp->nextdirty;",
  "            else",
  "              me->firstDirty = tmp->nextdirty;",
  "            if (tmp->nextdirty)",
  "              tmp->nextdirty->prevdirty = tmp->prevdirty;",
  "            else",
  "              me->lastDirty = tmp->prevdirty;",
  "            tmp->prevdirty = nullptr;",
  "            tmp->nextdirty = nullptr;",
  "            break;",
  "          } else",
  "            // Delete the object right away",
  "            tmp->expire();",
  "        }",
  "",
  "        // Write some dirty object right if we haven't found one yet",
  "        if (!entry2delete && me->writeImmediately && me->firstDirty) {",
  "          // Find an object that isn't in use",
  "          entry2flush = me->firstDirty;",
  "          while (entry2flush && entry2flush->val.use_count() > 1)",
  "            entry2flush = entry2flush->nextdirty;",
  "          if (!entry2flush) entry2flush = me->firstDirty;",
  "          if (entry2flush) {",
  "            // Unlink from the cache",
  "            if (entry2flush->prevdirty)",
  "              entry2flush->prevdirty->nextdirty = entry2flush->nextdirty;",
  "            else",
  "              me->firstDirty = entry2flush->nextdirty;",
  "            if (entry2flush->nextdirty)",
  "              entry2flush->nextdirty->prevdirty = entry2flush->prevdirty;",
  "            else",
  "              me->lastDirty = entry2flush->prevdirty;",
  "            entry2flush->nextdirty = nullptr;",
  "            entry2flush->prevdirty = nullptr;",
  "          }",
  "        }",
  "",
  "#ifdef DEBUG_CACHE",
  "        // Validate things are ok",
  "        me->checkIntegrity();",
  "#endif",
  "      }",
  "",
  "      // Do the work now",
  "      try {",
  "        if (entry2delete) {",
  "          // Flush and delete a cache entry",
  "          entry2delete->flush();",
  "          {",
  "            lock_guard<mutex> lk(me->lock);",
  "            if (!entry2delete->prev && me->firstEntry != entry2delete)",
  "              // During the execution of the flush, the entry could effectively",
  "              // already be inserted again!",
  "              entry2delete->expire();",
  "          }",
  "        } else if (entry2flush) {",
  "          // Flush a cache entry",
  "          entry2flush->flush();",
  "        } else {",
  "          // No more work to do",
  "          lock_guard<mutex> lk(me->lock);",
  "          if (!me->firstDirty) me->master_waiting.notify_one();",
  "          break;",
  "        }",
  "      } catch (const exception& e) {",
  "        logger << \"Warning : exception on cache worker thread: \" << e.what()",
  "               << '\\n';",
  "      } catch (...) {",
  "        logger << \"Warning : exception on cache worker thread\\n\";",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "pair<size_t, size_t> Cache::getStatus() const {",
  "  lock_guard<mutex> l(Cache::instance->lock);",
  "  size_t count = 0;",
  "  size_t size = 0;",
  "  for (auto ptr = firstEntry; ptr; ptr = ptr->next) {",
  "    ++count;",
  "    size += ptr->getSize();",
  "  }",
  "  return make_pair(count, size);",
  "}",
  "",
  "void Cache::checkIntegrity() const {",
  "  // IMPORTANT! We assume the lock is already held by the calling routine.",
  "",
  "  // Heads and tails",
  "  if (firstEntry && firstEntry->prev)",
  "    throw LogicException(\"ERROR: invalid cache head\");",
  "  if (lastEntry && lastEntry->next)",
  "    throw LogicException(\"ERROR: invalid cache tail\");",
  "  if (firstDirty && firstDirty->prevdirty)",
  "    throw LogicException(\"ERROR: invalid cache dirty head\");",
  "  if (lastDirty && lastDirty->nextdirty)",
  "    throw LogicException(\"ERROR: invalid cache dirty tail\");",
  "",
  "  // Count elements in the cache list - walking forward",
  "  unsigned long cnt = 0;",
  "  unsigned long cntdirty1 = 0;",
  "  AbstractCacheEntry* prev = nullptr;",
  "  for (auto ptr = firstEntry; ptr; ptr = ptr->next) {",
  "    ++cnt;",
  "    if (ptr->isDirty()) ++cntdirty1;",
  "    if (ptr->prev != prev)",
  "      throw LogicException(\"ERROR: corrupted cache list found in forward walk\");",
  "    prev = ptr;",
  "  }",
  "  if (cnt != count) throw LogicException(\"ERROR: mismatch in cache size\");",
  "",
  "  // Count elements in the cache list - walking forward",
  "  prev = nullptr;",
  "  cnt = 0;",
  "  for (auto ptr = lastEntry; ptr; ptr = ptr->prev) {",
  "    ++cnt;",
  "    if (ptr->next != prev)",
  "      throw LogicException(\"ERROR: corrupted cache list in backward walk\");",
  "    prev = ptr;",
  "  }",
  "  if (cnt != count) throw LogicException(\"ERROR: mismatch in cache size\");",
  "",
  "  // Count elements in the dirty list",
  "  unsigned long cntdirty2 = 0;",
  "  prev = nullptr;",
  "  for (auto ptr = firstDirty; ptr; ptr = ptr->nextdirty) {",
  "    ++cntdirty2;",
  "    if (ptr->prevdirty != prev)",
  "      throw LogicException(\"ERROR: corrupted dirty cache list\");",
  "    prev = ptr;",
  "  }",
  "",
  "  if (cntdirty1 != cntdirty2)",
  "    throw DataException(\"ERROR: mismatch in dirty count\");",
  "}",
  "",
  "}  // namespace frepple::utils",
];
