
/**
 * Semantic migration unit for src/utils/library.cpp.
 * Generated once as a structural baseline and then maintained as TypeScript.
 */

export type PortScalar = string | number | boolean | bigint | null;
export type PortValue = PortScalar | object | readonly PortValue[];

export type AdapterValue = unknown;

import { appendFileSync, existsSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Date as PlanningDate, DateRange } from "./date.js";

const fieldAliases: Readonly<Record<string, string>> = {
  forecast_current: "FcstCurrent",
  forecastcurrent: "FcstCurrent",
  time_zone: "TimeZone",
  timezone: "TimeZone",
  loglimit: "loglimit",
};

function setterSuffix(name: string): string {
  const normalized = name.replace(/^@/, "").replaceAll("-", "_");
  const alias = fieldAliases[normalized.toLowerCase()];
  if (alias) return alias;
  return normalized.split("_").filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join("");
}

function coerceInputValue(value: unknown, current: unknown): unknown {
  if (typeof current === "boolean" && typeof value === "string") return !["", "0", "false", "f", "no", "n"].includes(value.trim().toLowerCase());
  if (typeof current === "number" && typeof value === "string") {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }
  return value;
}

/** Applies parsed XML or JSON scalar fields through the C++-shaped setter API. */
export function applyDataFields(root: unknown, record: unknown): void {
  if (!root || typeof root !== "object" || !record || typeof record !== "object" || Array.isArray(record)) return;
  const target = root as Record<string, unknown>;
  for (const [name, value] of Object.entries(record)) {
    if (value !== null && typeof value === "object") continue;
    const suffix = setterSuffix(name);
    const setter = Reflect.get(target, `set${suffix}`);
    if (typeof setter !== "function") continue;
    const getter = Reflect.get(target, `get${suffix}`);
    let current: unknown;
    if (typeof getter === "function") {
      try { current = Reflect.apply(getter, root, []); } catch { current = undefined; }
    }
    Reflect.apply(setter, root, [coerceInputValue(value, current)]);
  }
}

/**
 * Runtime bridge for C++ classes whose native concerns (pointer ownership,
 * RTTI, Python slots and STL iterators) don't have a direct JavaScript form.
 * It supplies deterministic object identity, property storage, collection
 * traversal and metadata registration while concrete ports retain the C++ API.
 */
export class HeaderModelAdapter implements Iterable<AdapterValue> {
  private static readonly types = new Map<string, { initialized: boolean; instances: Set<HeaderModelAdapter> }>();
  private readonly adapterState = new Map<string, AdapterValue>();
  private readonly adapterCollections = new Map<string, AdapterValue[]>();
  private readonly adapterReferences = new Map<string, Set<HeaderModelAdapter>>();
  private readonly adapterProperties = new Map<string, AdapterValue>();
  private readonly adapterType: string;
  private readonly adapterRegistryType: string;
  static modelFamily: string | undefined;

  constructor(...args: readonly AdapterValue[]) {
    this.adapterType = new.target.name;
    this.adapterRegistryType = (new.target as typeof HeaderModelAdapter).modelFamily ?? this.adapterType;
    const metadata = HeaderModelAdapter.ensureType(this.adapterRegistryType);
    if (typeof args[0] !== "string" && args[0] && typeof args[0] === "object") {
      for (const [key, value] of Object.entries(args[0])) this.adapterState.set(HeaderModelAdapter.key(key), value);
    }
    const proxy = new Proxy(this, {
      get: (target, property, receiver) => {
        if (typeof property !== "string" || property in target) return Reflect.get(target, property, receiver) as AdapterValue;
        return (...methodArgs: readonly AdapterValue[]) => target.invokeAdapter(property, methodArgs);
      },
      set: (target, property, value, receiver) => {
        if (typeof property !== "string" || property in target) return Reflect.set(target, property, value, receiver);
        target.adapterState.set(HeaderModelAdapter.key(property), value);
        return true;
      },
    });
    metadata.instances.add(proxy);
    return proxy;
  }

  private static key(name: string): string {
    return name.length ? `${name[0]?.toUpperCase() ?? ""}${name.slice(1)}` : name;
  }

  private static ensureType(name: string): { initialized: boolean; instances: Set<HeaderModelAdapter> } {
    let metadata = HeaderModelAdapter.types.get(name);
    if (!metadata) {
      metadata = { initialized: false, instances: new Set() };
      HeaderModelAdapter.types.set(name, metadata);
    }
    return metadata;
  }

  static invokeStatic(type: string, method: string, args: readonly AdapterValue[]): AdapterValue {
    const metadata = HeaderModelAdapter.ensureType(type);
    if (method === "initialize" || method === "registerFields") {
      metadata.initialized = true;
      return 0;
    }
    if (method === "clear") {
      metadata.instances.clear();
      return undefined;
    }
    if (method === "all" || method === "begin" || method === "createIterator") {
      const result = [...metadata.instances];
      // The native object registries are name-indexed. Planning code relies on
      // this order for cluster discovery, buffer sweeps and deterministic ties.
      result.sort((left, right) => {
        const leftGetter = Reflect.get(left, "getName");
        const rightGetter = Reflect.get(right, "getName");
        if (typeof leftGetter !== "function" || typeof rightGetter !== "function") return 0;
        const leftName = String(Reflect.apply(leftGetter, left, []));
        const rightName = String(Reflect.apply(rightGetter, right, []));
        return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
      });
      return result;
    }
    if (method === "end") return [];
    if (method === "find" || method === "findFromName") {
      const name = args[0];
      return [...metadata.instances].find((entry) => {
        const getter = Reflect.get(entry, "getName");
        return (typeof getter === "function" ? Reflect.apply(getter, entry, []) : entry.invokeAdapter("getName", [])) === name;
      });
    }
    if (method === "instance") return [...metadata.instances][0] ?? undefined;
    if (method.startsWith("create")) return args[0] ?? undefined;
    if (method.startsWith("get") || method.startsWith("is") || method.startsWith("has")) return undefined;
    return args[0];
  }

  static initialize(): number {
    return Number(HeaderModelAdapter.invokeStatic(this.name, "initialize", []));
  }

  static registerFields(): number {
    return Number(HeaderModelAdapter.invokeStatic(this.name, "registerFields", []));
  }

  static clear(): void {
    for (const instance of this.all()) instance.dispose();
  }

  static all<T extends typeof HeaderModelAdapter>(this: T): InstanceType<T>[] {
    return HeaderModelAdapter.invokeStatic(this.modelFamily ?? this.name, "all", []) as InstanceType<T>[];
  }

  static find<T extends typeof HeaderModelAdapter>(this: T, name: string): InstanceType<T> | undefined {
    return HeaderModelAdapter.invokeStatic(this.modelFamily ?? this.name, "find", [name]) as InstanceType<T> | undefined;
  }

  static createIterator<T extends typeof HeaderModelAdapter>(this: T): IterableIterator<InstanceType<T>> {
    return this.all().values();
  }

  hasProperty(name: string): boolean { return this.adapterProperties.has(String(name)); }
  deleteProperty(name: string): boolean { return this.adapterProperties.delete(String(name)); }
  setProperty(name: string, value: AdapterValue): void { this.adapterProperties.set(String(name), value); }
  getPyObjectProperty(name: string): AdapterValue { return this.adapterProperties.get(String(name)); }
  setDoubleProperty(name: string, value: number): void { this.setProperty(name, Number(value)); }
  getDoubleProperty(name: string, defaultValue = 0): number {
    const value = this.adapterProperties.get(String(name));
    return value === undefined ? defaultValue : Number(value);
  }
  setStringProperty(name: string, value: string): void { this.setProperty(name, String(value)); }
  getStringProperty(name: string, defaultValue = ""): string {
    const value = this.adapterProperties.get(String(name));
    return value === undefined ? defaultValue : String(value);
  }
  setBoolProperty(name: string, value: boolean): void { this.setProperty(name, Boolean(value)); }
  getBoolProperty(name: string, defaultValue = false): boolean {
    const value = this.adapterProperties.get(String(name));
    return value === undefined ? defaultValue : Boolean(value);
  }
  setDateProperty(name: string, value: PlanningDate): void { this.setProperty(name, new PlanningDate(value)); }
  getDateProperty(name: string, defaultValue = PlanningDate.infinitePast): PlanningDate {
    const value = this.adapterProperties.get(String(name));
    return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(defaultValue);
  }

  protected invokeAdapter(method: string, args: readonly AdapterValue[]): AdapterValue {
    const suffix = HeaderModelAdapter.key(method.replace(/^(?:get|set|is|has|inc|dec|add|remove)/, ""));
    if (method.startsWith("set")) {
      const previous = this.adapterState.get(suffix);
      const value = args[0];
      if (previous === value) return undefined;
      if (previous && typeof previous === "object") {
        const callback = Reflect.get(previous, "modelReferenceRemoved");
        if (typeof callback === "function") Reflect.apply(callback, previous, [this, suffix]);
      }
      this.adapterState.set(suffix, value);
      if (value && typeof value === "object") {
        const callback = Reflect.get(value, "modelReferenceAdded");
        if (typeof callback === "function") Reflect.apply(callback, value, [this, suffix]);
      }
      return undefined;
    }
    if (method.startsWith("get")) {
      if (method.endsWith("Iterator")) return this.adapterCollections.get(suffix.replace(/Iterator$/, ""))?.values() ?? [][Symbol.iterator]();
      return this.adapterState.get(suffix) ?? this.adapterCollections.get(suffix);
    }
    if (method.startsWith("is") || method.startsWith("has")) return Boolean(this.adapterState.get(suffix));
    if (method.startsWith("inc") || method.startsWith("dec")) {
      const delta = method.startsWith("inc") ? 1 : -1;
      const value = Number(this.adapterState.get(suffix) ?? 0) + delta;
      this.adapterState.set(suffix, value);
      return value;
    }
    if (method.startsWith("add")) {
      const values = this.adapterCollections.get(suffix) ?? [];
      values.push(args[0]);
      this.adapterCollections.set(suffix, values);
      return args[0];
    }
    if (method.startsWith("remove") || method.startsWith("delete")) {
      const values = this.adapterCollections.get(suffix);
      if (!values) return false;
      const index = values.indexOf(args[0]);
      if (index < 0) return false;
      values.splice(index, 1);
      return true;
    }
    if (method === "empty") return this.adapterState.size === 0 && this.adapterCollections.size === 0;
    if (method === "size" || method === "getSize") return this.adapterState.size + [...this.adapterCollections.values()].reduce((sum, values) => sum + values.length, 0);
    if (method === "begin") return this[Symbol.iterator]();
    if (method === "end") return [][Symbol.iterator]();
    if (method === "clear") {
      this.adapterState.clear();
      this.adapterCollections.clear();
      return undefined;
    }
    if (method === "getType") return this.adapterType;
    if (method === "toString" || method === "str" || method === "print") return this.toJSON();
    return args[0];
  }

  [Symbol.iterator](): Iterator<AdapterValue> {
    return [...this.adapterCollections.values()].flat().values();
  }

  toJSON(): Record<string, AdapterValue> {
    return Object.fromEntries(this.adapterState);
  }

  writeProperties(serializer: { writeProperty?(name: string, value: AdapterValue): void }): void {
    for (const [name, value] of Object.entries(this.toJSON())) serializer.writeProperty?.(name, value);
  }

  modelReferenceAdded(source: HeaderModelAdapter, property: string): void {
    const references = this.adapterReferences.get(property) ?? new Set<HeaderModelAdapter>();
    references.add(source);
    this.adapterReferences.set(property, references);
  }

  modelReferenceRemoved(source: HeaderModelAdapter, property: string): void {
    const references = this.adapterReferences.get(property);
    references?.delete(source);
    if (references?.size === 0) this.adapterReferences.delete(property);
  }

  referencedBy(property?: string): HeaderModelAdapter[] {
    if (property) return [...(this.adapterReferences.get(property) ?? [])];
    return [...new Set([...this.adapterReferences.values()].flatMap((values) => [...values]))];
  }

  modelReferenceTargetDisposed(_target: HeaderModelAdapter, property: string): void {
    const setter = Reflect.get(this, `set${property}`);
    if (typeof setter === "function") Reflect.apply(setter, this, [null]);
  }

  dispose(): void {
    const incoming = [...this.adapterReferences.entries()].flatMap(([property, sources]) =>
      [...sources].map((source) => [property, source] as const));
    this.adapterReferences.clear();
    for (const [property, source] of incoming) source.modelReferenceTargetDisposed(this, property);
    HeaderModelAdapter.ensureType(this.adapterRegistryType).instances.delete(this);
    for (const [property, value] of this.adapterState) {
      if (!value || typeof value !== "object") continue;
      const callback = Reflect.get(value, "modelReferenceRemoved");
      if (typeof callback === "function") Reflect.apply(callback, value, [this, property]);
    }
    this.adapterState.clear();
    this.adapterCollections.clear();
  }
}

// <header-api-generated>
export class Association extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association"] as const;
  reader(...args: readonly unknown[]): unknown { return this.invokeAdapter("reader", args); }
}

export class AssociationList extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association::List"] as const;
  empty(...args: readonly unknown[]): unknown { return this.invokeAdapter("empty", args); }
}

export class AssociationListA extends HeaderModelAdapter {
  static readonly cppBases = ["AssociationList"] as const;
  static readonly cppQualifiedNames = ["Association::ListA"] as const;
  begin(...args: readonly unknown[]): unknown { return this.invokeAdapter("begin", args); }
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
  erase(...args: readonly unknown[]): unknown { return this.invokeAdapter("erase", args); }
  find(...args: readonly unknown[]): unknown { return this.invokeAdapter("find", args); }
  size(...args: readonly unknown[]): unknown { return this.invokeAdapter("size", args); }
}

export class AssociationListAConst_iterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association::ListA::const_iterator"] as const;
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class AssociationListAIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association::ListA::iterator"] as const;
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class AssociationListB extends HeaderModelAdapter {
  static readonly cppBases = ["AssociationList"] as const;
  static readonly cppQualifiedNames = ["Association::ListB"] as const;
  begin(...args: readonly unknown[]): unknown { return this.invokeAdapter("begin", args); }
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
  erase(...args: readonly unknown[]): unknown { return this.invokeAdapter("erase", args); }
  find(...args: readonly unknown[]): unknown { return this.invokeAdapter("find", args); }
  size(...args: readonly unknown[]): unknown { return this.invokeAdapter("size", args); }
}

export class AssociationListBConst_iterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association::ListB::const_iterator"] as const;
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class AssociationListBIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association::ListB::iterator"] as const;
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class AssociationNode extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Association::Node"] as const;
  getEffective(...args: readonly unknown[]): unknown { return this.invokeAdapter("getEffective", args); }
  getEffectiveEnd(...args: readonly unknown[]): unknown { return this.invokeAdapter("getEffectiveEnd", args); }
  getEffectiveStart(...args: readonly unknown[]): unknown { return this.invokeAdapter("getEffectiveStart", args); }
  getName(...args: readonly unknown[]): unknown { return this.invokeAdapter("getName", args); }
  getPriority(...args: readonly unknown[]): unknown { return this.invokeAdapter("getPriority", args); }
  getPtrA(...args: readonly unknown[]): unknown { return this.invokeAdapter("getPtrA", args); }
  getPtrB(...args: readonly unknown[]): unknown { return this.invokeAdapter("getPtrB", args); }
  setEffective(...args: readonly unknown[]): unknown { return this.invokeAdapter("setEffective", args); }
  setEffectiveEnd(...args: readonly unknown[]): unknown { return this.invokeAdapter("setEffectiveEnd", args); }
  setEffectiveStart(...args: readonly unknown[]): unknown { return this.invokeAdapter("setEffectiveStart", args); }
  setName(...args: readonly unknown[]): unknown { return this.invokeAdapter("setName", args); }
  setPriority(...args: readonly unknown[]): unknown { return this.invokeAdapter("setPriority", args); }
  setPtrA(...args: readonly unknown[]): unknown { return this.invokeAdapter("setPtrA", args); }
  setPtrAB(...args: readonly unknown[]): unknown { return this.invokeAdapter("setPtrAB", args); }
  setPtrB(...args: readonly unknown[]): unknown { return this.invokeAdapter("setPtrB", args); }
}

export const DataExceptionCppModel = { bases: ["logic_error"] as const, methods: [] as const, qualifiedNames: ["DataException"] as const };

export class DataInput extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["DataInput"] as const;
  callUserExitCpp(...args: readonly unknown[]): unknown { return this.invokeAdapter("callUserExitCpp", args); }
  getCommandManager(...args: readonly unknown[]): unknown { return this.invokeAdapter("getCommandManager", args); }
  getSource(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSource", args); }
  getUserExit(...args: readonly unknown[]): unknown { return this.invokeAdapter("getUserExit", args); }
  setCommandManager(...args: readonly unknown[]): unknown { return this.invokeAdapter("setCommandManager", args); }
  setSource(...args: readonly unknown[]): unknown { return this.invokeAdapter("setSource", args); }
  setUserExit(...args: readonly unknown[]): unknown { return this.invokeAdapter("setUserExit", args); }
  setUserExitCpp(...args: readonly unknown[]): unknown { return this.invokeAdapter("setUserExitCpp", args); }
}

export const DataKeywordCppModel = { bases: [] as const, methods: ["getHash","getName","isA","reset"] as const, qualifiedNames: ["DataKeyword"] as const };

export class DataValue extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["DataValue"] as const;
  getBool(...args: readonly unknown[]): unknown { return this.invokeAdapter("getBool", args); }
  getDate(...args: readonly unknown[]): unknown { return this.invokeAdapter("getDate", args); }
  getDouble(...args: readonly unknown[]): unknown { return this.invokeAdapter("getDouble", args); }
  getDuration(...args: readonly unknown[]): unknown { return this.invokeAdapter("getDuration", args); }
  getInt(...args: readonly unknown[]): unknown { return this.invokeAdapter("getInt", args); }
  getLong(...args: readonly unknown[]): unknown { return this.invokeAdapter("getLong", args); }
  getObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("getObject", args); }
  getString(...args: readonly unknown[]): unknown { return this.invokeAdapter("getString", args); }
  getStringList(...args: readonly unknown[]): unknown { return this.invokeAdapter("getStringList", args); }
  getUnsignedLong(...args: readonly unknown[]): unknown { return this.invokeAdapter("getUnsignedLong", args); }
  setBool(...args: readonly unknown[]): unknown { return this.invokeAdapter("setBool", args); }
  setDate(...args: readonly unknown[]): unknown { return this.invokeAdapter("setDate", args); }
  setDouble(...args: readonly unknown[]): unknown { return this.invokeAdapter("setDouble", args); }
  setDuration(...args: readonly unknown[]): unknown { return this.invokeAdapter("setDuration", args); }
  setInt(...args: readonly unknown[]): unknown { return this.invokeAdapter("setInt", args); }
  setLong(...args: readonly unknown[]): unknown { return this.invokeAdapter("setLong", args); }
  setObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("setObject", args); }
  setString(...args: readonly unknown[]): unknown { return this.invokeAdapter("setString", args); }
  setUnsignedLong(...args: readonly unknown[]): unknown { return this.invokeAdapter("setUnsignedLong", args); }
}

export const DataValueDictCppModel = { bases: [] as const, methods: ["get"] as const, qualifiedNames: ["DataValueDict"] as const };

export const DateCppModel = { bases: [] as const, methods: ["detectUTC","getInfo","getTicks","isUTC","now","parse","toCharBuffer","toString"] as const, qualifiedNames: ["Date"] as const };

export const DateDetailCppModel = { bases: [] as const, methods: ["addDays","getSecondsDay","getSecondsMonth","getSecondsWeek","getSecondsYear","getWeekDay","normalize","roundDownDay","roundUpDay","setSecondsDay","toCharBuffer","toString"] as const, qualifiedNames: ["DateDetail"] as const };

export const DateRangeCppModel = { bases: [] as const, methods: ["almostEqual","between","getDuration","getEnd","getStart","intersect","overlap","setEnd","setStart","setStartAndEnd","within"] as const, qualifiedNames: ["DateRange"] as const };

export const DurationCppModel = { bases: [] as const, methods: ["double2CharBuffer","getSeconds","parse","parse2double"] as const, qualifiedNames: ["Duration"] as const };

export const EnvironmentCppModel = { bases: [] as const, methods: ["getLogFile","getLogFileSize","getProcessorCores","getloglimit","searchFile","setLogFile","setProcessName","setloglimit","truncateLogFile"] as const, qualifiedNames: ["Environment"] as const };

export class FreppleCategory extends HeaderModelAdapter {
  static readonly cppBases = ["PythonExtension"] as const;
  static readonly cppQualifiedNames = ["FreppleCategory"] as const;
  initialize(...args: readonly unknown[]): unknown { return this.invokeAdapter("initialize", args); }
}

export class FreppleClass extends HeaderModelAdapter {
  static readonly cppBases = ["PythonExtension"] as const;
  static readonly cppQualifiedNames = ["FreppleClass"] as const;
  initialize(...args: readonly unknown[]): unknown { return this.invokeAdapter("initialize", args); }
}

export class Functor extends HeaderModelAdapter {
  static readonly cppBases = ["NonCopyable"] as const;
  static readonly cppQualifiedNames = ["Functor"] as const;
  callback(...args: readonly unknown[]): unknown { return this.invokeAdapter("callback", args); }
}

export class FunctorInstance extends HeaderModelAdapter {
  static readonly cppBases = ["Functor"] as const;
  static readonly cppQualifiedNames = ["FunctorInstance"] as const;
  connect(...args: readonly unknown[]): unknown { return this.invokeAdapter("connect", args); }
  disconnect(...args: readonly unknown[]): unknown { return this.invokeAdapter("disconnect", args); }
}

export class FunctorStatic extends HeaderModelAdapter {
  static readonly cppBases = ["Functor"] as const;
  static readonly cppQualifiedNames = ["FunctorStatic"] as const;
  connect(...args: readonly unknown[]): unknown { return this.invokeAdapter("connect", args); }
  disconnect(...args: readonly unknown[]): unknown { return this.invokeAdapter("disconnect", args); }
}

export class HasDescription extends HeaderModelAdapter {
  static readonly cppBases = ["HasSource"] as const;
  static readonly cppQualifiedNames = ["HasDescription"] as const;
  getCategory(...args: readonly unknown[]): unknown { return this.invokeAdapter("getCategory", args); }
  getDescription(...args: readonly unknown[]): unknown { return this.invokeAdapter("getDescription", args); }
  getSubCategory(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSubCategory", args); }
  registerFields(...args: readonly unknown[]): unknown { return this.invokeAdapter("registerFields", args); }
  setCategory(...args: readonly unknown[]): unknown { return this.invokeAdapter("setCategory", args); }
  setDescription(...args: readonly unknown[]): unknown { return this.invokeAdapter("setDescription", args); }
  setSubCategory(...args: readonly unknown[]): unknown { return this.invokeAdapter("setSubCategory", args); }
}

export class HasHierarchy extends HeaderModelAdapter {
  static readonly cppBases = ["HasDescription","HasName"] as const;
  static readonly cppQualifiedNames = ["HasHierarchy"] as const;
  getAllMembers(...args: readonly unknown[]): unknown { return this.invokeAdapter("getAllMembers", args); }
  getFirstChild(...args: readonly unknown[]): unknown { return this.invokeAdapter("getFirstChild", args); }
  getHierarchyLevel(...args: readonly unknown[]): unknown { return this.invokeAdapter("getHierarchyLevel", args); }
  getMembers(...args: readonly unknown[]): unknown { return this.invokeAdapter("getMembers", args); }
  getNextBrother(...args: readonly unknown[]): unknown { return this.invokeAdapter("getNextBrother", args); }
  getOwner(...args: readonly unknown[]): unknown { return this.invokeAdapter("getOwner", args); }
  getRoot(...args: readonly unknown[]): unknown { return this.invokeAdapter("getRoot", args); }
  getTop(...args: readonly unknown[]): unknown { return this.invokeAdapter("getTop", args); }
  hasOwner(...args: readonly unknown[]): unknown { return this.invokeAdapter("hasOwner", args); }
  isGroup(...args: readonly unknown[]): unknown { return this.invokeAdapter("isGroup", args); }
  isMemberOf(...args: readonly unknown[]): unknown { return this.invokeAdapter("isMemberOf", args); }
  registerFields(...args: readonly unknown[]): unknown { return this.invokeAdapter("registerFields", args); }
  setOwner(...args: readonly unknown[]): unknown { return this.invokeAdapter("setOwner", args); }
  sortMembers(...args: readonly unknown[]): unknown { return this.invokeAdapter("sortMembers", args); }
}

export class HasHierarchyMemberIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["HasHierarchy::memberIterator"] as const;
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class HasHierarchyMemberRecursiveIterator extends HeaderModelAdapter {
  static readonly cppBases = ["NonCopyable"] as const;
  static readonly cppQualifiedNames = ["HasHierarchy::memberRecursiveIterator"] as const;
  empty(...args: readonly unknown[]): unknown { return this.invokeAdapter("empty", args); }
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class HasName extends HeaderModelAdapter {
  static readonly cppBases = ["NonCopyable","Object","TreeNode"] as const;
  static readonly cppQualifiedNames = ["HasName"] as const;
  begin(...args: readonly unknown[]): unknown { return this.invokeAdapter("begin", args); }
  clear(...args: readonly unknown[]): unknown { return this.invokeAdapter("clear", args); }
  compare(...args: readonly unknown[]): unknown { return this.invokeAdapter("compare", args); }
  createIterator(...args: readonly unknown[]): unknown { return this.invokeAdapter("createIterator", args); }
  empty(...args: readonly unknown[]): unknown { return this.invokeAdapter("empty", args); }
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
  find(...args: readonly unknown[]): unknown { return this.invokeAdapter("find", args); }
  findLowerBound(...args: readonly unknown[]): unknown { return this.invokeAdapter("findLowerBound", args); }
  finder(...args: readonly unknown[]): unknown { return this.invokeAdapter("finder", args); }
  reader(...args: readonly unknown[]): unknown { return this.invokeAdapter("reader", args); }
  setName(...args: readonly unknown[]): unknown { return this.invokeAdapter("setName", args); }
  size(...args: readonly unknown[]): unknown { return this.invokeAdapter("size", args); }
  str(...args: readonly unknown[]): unknown { return this.invokeAdapter("str", args); }
  verify(...args: readonly unknown[]): unknown { return this.invokeAdapter("verify", args); }
}

export class HasNameAll extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["HasName::all"] as const;
  begin(...args: readonly unknown[]): unknown { return this.invokeAdapter("begin", args); }
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
}

export class HasNameIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["HasName::iterator"] as const;
  next(...args: readonly unknown[]): unknown { return this.invokeAdapter("next", args); }
}

export class HasSource extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["HasSource"] as const;
  getSource(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSource", args); }
  registerFields(...args: readonly unknown[]): unknown { return this.invokeAdapter("registerFields", args); }
  setSource(...args: readonly unknown[]): unknown { return this.invokeAdapter("setSource", args); }
}

export class indent extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["indent"] as const;
}

export const KeywordCppModel = { bases: ["NonCopyable"] as const, methods: ["find","getFullName","getHash","getName","getTags","hash","printTags"] as const, qualifiedNames: ["Keyword"] as const };

export const LibraryUtilsCppModel = { bases: [] as const, methods: ["initialize"] as const, qualifiedNames: ["LibraryUtils"] as const };

export const LogicExceptionCppModel = { bases: ["logic_error"] as const, methods: [] as const, qualifiedNames: ["LogicException"] as const };

export class MemoryPool extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MemoryPool"] as const;
}

export class MemoryPoolMemoryObject extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MemoryPool::MemoryObject"] as const;
}

export class MemoryPoolMemoryObjectList extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MemoryPool::MemoryObjectList"] as const;
  back(...args: readonly unknown[]): unknown { return this.invokeAdapter("back", args); }
  begin(...args: readonly unknown[]): unknown { return this.invokeAdapter("begin", args); }
  empty(...args: readonly unknown[]): unknown { return this.invokeAdapter("empty", args); }
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
  front(...args: readonly unknown[]): unknown { return this.invokeAdapter("front", args); }
  insert(...args: readonly unknown[]): unknown { return this.invokeAdapter("insert", args); }
  pop_back(...args: readonly unknown[]): unknown { return this.invokeAdapter("pop_back", args); }
  pop_front(...args: readonly unknown[]): unknown { return this.invokeAdapter("pop_front", args); }
  sort(...args: readonly unknown[]): unknown { return this.invokeAdapter("sort", args); }
}

export class MemoryPoolMemoryObjectListIterator extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MemoryPool::MemoryObjectList::iterator"] as const;
}

export class MemoryPoolMemoryPage extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["MemoryPool::MemoryPage"] as const;
}

export const MetaCategoryCppModel = { bases: ["MetaClass"] as const, methods: ["ControllerDefault","find","findCategoryByGroupTag","findCategoryByTag","findClass","registerCategory","setDefaultClass"] as const, qualifiedNames: ["MetaCategory"] as const };

export const MetaClassCppModel = { bases: ["NonCopyable"] as const, methods: ["addBoolField","addClass","addCommandField","addDateField","addDoubleField","addDurationDoubleField","addDurationField","addEnumField","addFunctionField","addIntField","addIteratorClassField","addIteratorField","addPointerField","addShortField","addStringField","addStringRefField","addUnsignedLongField","connect","decodeAction","disconnect","findClass","findField","getFields","printClasses","raiseEvent","registerClass","setPythonClass"] as const, qualifiedNames: ["MetaClass"] as const };

export const MetaFieldBaseCppModel = { bases: [] as const, methods: ["getClass","getField","getFlag","getFunction","getHash","getKeyword","getName","getSize","isGroup","isPointer","setField","writeField"] as const, qualifiedNames: ["MetaFieldBase"] as const };

export class MetaFieldBool extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldBool"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldCommand extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldCommand"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldDate extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldDate"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldDouble extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldDouble"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldDuration extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldDuration"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldDurationDouble extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldDurationDouble"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldEnum extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldEnum"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldFunction extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldFunction"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  getFunction(...args: readonly unknown[]): unknown { return this.invokeAdapter("getFunction", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldInt extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldInt"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldIterator extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldIterator"] as const;
  getClass(...args: readonly unknown[]): unknown { return this.invokeAdapter("getClass", args); }
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  getKeyword(...args: readonly unknown[]): unknown { return this.invokeAdapter("getKeyword", args); }
  isGroup(...args: readonly unknown[]): unknown { return this.invokeAdapter("isGroup", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldIteratorClass extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldIteratorClass"] as const;
  getClass(...args: readonly unknown[]): unknown { return this.invokeAdapter("getClass", args); }
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  getKeyword(...args: readonly unknown[]): unknown { return this.invokeAdapter("getKeyword", args); }
  isGroup(...args: readonly unknown[]): unknown { return this.invokeAdapter("isGroup", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldPointer extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldPointer"] as const;
  getClass(...args: readonly unknown[]): unknown { return this.invokeAdapter("getClass", args); }
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  isPointer(...args: readonly unknown[]): unknown { return this.invokeAdapter("isPointer", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldShort extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldShort"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldString extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldString"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  getSize(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSize", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldStringRef extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldStringRef"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  getSize(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSize", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class MetaFieldUnsignedLong extends HeaderModelAdapter {
  static readonly cppBases = ["MetaFieldBase"] as const;
  static readonly cppQualifiedNames = ["MetaFieldUnsignedLong"] as const;
  getField(...args: readonly unknown[]): unknown { return this.invokeAdapter("getField", args); }
  setField(...args: readonly unknown[]): unknown { return this.invokeAdapter("setField", args); }
  writeField(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeField", args); }
}

export class NonCopyable extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["NonCopyable"] as const;
}

export const ObjectCppModel = { bases: ["PyObject"] as const, methods: ["call","compare","create","deallocator","deleteProperty","getBoolProperty","getDateProperty","getDoubleProperty","getHidden","getPyObjectProperty","getReferenceCount","getSize","getStringProperty","getType","getattro","hasProperty","hasType","initType","iternext","registerPythonType","resetReferenceCount","setBoolProperty","setDateProperty","setDoubleProperty","setHidden","setProperty","setStringProperty","str","toJSON","toXML","writeElement","writeProperties"] as const, qualifiedNames: ["Object"] as const };

export const PooledStringCppModel = { bases: [] as const, methods: ["at","back","contains","empty","front","getSize","getString","hash","print","size","starts_with"] as const, qualifiedNames: ["PooledString"] as const };

export class RecentlyUsed extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["RecentlyUsed"] as const;
  clear(...args: readonly unknown[]): unknown { return this.invokeAdapter("clear", args); }
  contains(...args: readonly unknown[]): unknown { return this.invokeAdapter("contains", args); }
  echoSince(...args: readonly unknown[]): unknown { return this.invokeAdapter("echoSince", args); }
  push(...args: readonly unknown[]): unknown { return this.invokeAdapter("push", args); }
  size(...args: readonly unknown[]): unknown { return this.invokeAdapter("size", args); }
}

export const RuntimeExceptionCppModel = { bases: ["runtime_error"] as const, methods: [] as const, qualifiedNames: ["RuntimeException"] as const };

export class Serializer extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Serializer"] as const;
  BeginList(...args: readonly unknown[]): unknown { return this.invokeAdapter("BeginList", args); }
  BeginObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("BeginObject", args); }
  EndList(...args: readonly unknown[]): unknown { return this.invokeAdapter("EndList", args); }
  EndObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("EndObject", args); }
  countObjects(...args: readonly unknown[]): unknown { return this.invokeAdapter("countObjects", args); }
  getContentType(...args: readonly unknown[]): unknown { return this.invokeAdapter("getContentType", args); }
  getCurrentObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("getCurrentObject", args); }
  getFlattenProperties(...args: readonly unknown[]): unknown { return this.invokeAdapter("getFlattenProperties", args); }
  getForceBase(...args: readonly unknown[]): unknown { return this.invokeAdapter("getForceBase", args); }
  getPreviousObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("getPreviousObject", args); }
  getSaveReferences(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSaveReferences", args); }
  getServiceMode(...args: readonly unknown[]): unknown { return this.invokeAdapter("getServiceMode", args); }
  getSkipHead(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSkipHead", args); }
  getSkipTail(...args: readonly unknown[]): unknown { return this.invokeAdapter("getSkipTail", args); }
  getWriteHidden(...args: readonly unknown[]): unknown { return this.invokeAdapter("getWriteHidden", args); }
  pushCurrentObject(...args: readonly unknown[]): unknown { return this.invokeAdapter("pushCurrentObject", args); }
  setContentType(...args: readonly unknown[]): unknown { return this.invokeAdapter("setContentType", args); }
  setForceBase(...args: readonly unknown[]): unknown { return this.invokeAdapter("setForceBase", args); }
  setSaveReferences(...args: readonly unknown[]): unknown { return this.invokeAdapter("setSaveReferences", args); }
  setServiceMode(...args: readonly unknown[]): unknown { return this.invokeAdapter("setServiceMode", args); }
  setWriteHidden(...args: readonly unknown[]): unknown { return this.invokeAdapter("setWriteHidden", args); }
  skipHead(...args: readonly unknown[]): unknown { return this.invokeAdapter("skipHead", args); }
  skipTail(...args: readonly unknown[]): unknown { return this.invokeAdapter("skipTail", args); }
  writeElement(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeElement", args); }
  writeString(...args: readonly unknown[]): unknown { return this.invokeAdapter("writeString", args); }
}

export class StreambufWrapper extends HeaderModelAdapter {
  static readonly cppBases = ["filebuf"] as const;
  static readonly cppQualifiedNames = ["StreambufWrapper"] as const;
  getLogLimit(...args: readonly unknown[]): unknown { return this.invokeAdapter("getLogLimit", args); }
  setLogLimit(...args: readonly unknown[]): unknown { return this.invokeAdapter("setLogLimit", args); }
  sync(...args: readonly unknown[]): unknown { return this.invokeAdapter("sync", args); }
}

export const ThreadGroupCppModel = { bases: ["NonCopyable"] as const, methods: ["add","execute","getMaxParallel","setMaxParallel"] as const, qualifiedNames: ["ThreadGroup"] as const };

export class ThreadSafeLogProxy extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["ThreadSafeLogProxy"] as const;
  flush(...args: readonly unknown[]): unknown { return this.invokeAdapter("flush", args); }
  rdbuf(...args: readonly unknown[]): unknown { return this.invokeAdapter("rdbuf", args); }
}

export class Tree extends HeaderModelAdapter {
  static readonly cppBases = ["NonCopyable"] as const;
  static readonly cppQualifiedNames = ["Tree"] as const;
  begin(...args: readonly unknown[]): unknown { return this.invokeAdapter("begin", args); }
  clear(...args: readonly unknown[]): unknown { return this.invokeAdapter("clear", args); }
  compare(...args: readonly unknown[]): unknown { return this.invokeAdapter("compare", args); }
  empty(...args: readonly unknown[]): unknown { return this.invokeAdapter("empty", args); }
  end(...args: readonly unknown[]): unknown { return this.invokeAdapter("end", args); }
  erase(...args: readonly unknown[]): unknown { return this.invokeAdapter("erase", args); }
  find(...args: readonly unknown[]): unknown { return this.invokeAdapter("find", args); }
  findLowerBound(...args: readonly unknown[]): unknown { return this.invokeAdapter("findLowerBound", args); }
  insert(...args: readonly unknown[]): unknown { return this.invokeAdapter("insert", args); }
  rename(...args: readonly unknown[]): unknown { return this.invokeAdapter("rename", args); }
  size(...args: readonly unknown[]): unknown { return this.invokeAdapter("size", args); }
  verify(...args: readonly unknown[]): unknown { return this.invokeAdapter("verify", args); }
}

export class TreeTreeNode extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Tree::TreeNode"] as const;
  decrement(...args: readonly unknown[]): unknown { return this.invokeAdapter("decrement", args); }
  getColor(...args: readonly unknown[]): unknown { return this.invokeAdapter("getColor", args); }
  getName(...args: readonly unknown[]): unknown { return this.invokeAdapter("getName", args); }
  increment(...args: readonly unknown[]): unknown { return this.invokeAdapter("increment", args); }
  setName(...args: readonly unknown[]): unknown { return this.invokeAdapter("setName", args); }
}

export const XMLDataCppModel = { bases: ["DataValue"] as const, methods: ["appendString","getBool","getData","getDate","getDouble","getDuration","getInt","getLong","getObject","getString","getStringList","getUnsignedLong","reset","setBool","setData","setDate","setDouble","setDuration","setInt","setLong","setObject","setString","setUnsignedLong"] as const, qualifiedNames: ["XMLData"] as const };
// </header-api-generated>

/**
 * JavaScript ownership model for the C++ HasName and HasHierarchy templates.
 * Concrete entity ports inherit this class while retaining their extracted
 * C++ base metadata through cppBases.
 */
export class ModelEntity<T extends ModelEntity<T>> extends HeaderModelAdapter {
  private entityName = "";
  private entitySource = "";
  private entityCategory = "";
  private entitySubCategory = "";
  private entityDescription = "";
  private entityHidden = false;
  private entityOwner: T | null = null;
  private readonly entityMembers: T[] = [];
  private entityDisposed = false;

  constructor(nameOrFields?: string | Readonly<Record<string, unknown>>) {
    super(typeof nameOrFields === "string" ? nameOrFields : nameOrFields);
    if (typeof nameOrFields === "string") this.setName(nameOrFields);
    else if (nameOrFields) applyDataFields(this, nameOrFields);
  }

  getName(): string { return this.entityName; }
  setName(value: string): void {
    const name = String(value);
    const constructor = this.constructor as typeof HeaderModelAdapter;
    const duplicate = constructor.find(name);
    if (duplicate && duplicate !== this) throw new DataException(`Object '${name}' already exists`);
    this.entityName = name;
  }
  getSource(): string { return this.entitySource; }
  setSource(value: string): void { this.entitySource = String(value); }
  getCategory(): string { return this.entityCategory; }
  setCategory(value: string): void { this.entityCategory = String(value); }
  getSubCategory(): string { return this.entitySubCategory; }
  setSubCategory(value: string): void { this.entitySubCategory = String(value); }
  getDescription(): string { return this.entityDescription; }
  setDescription(value: string): void { this.entityDescription = String(value); }
  getHidden(): boolean { return this.entityHidden; }
  setHidden(value: boolean): void { this.entityHidden = Boolean(value); }

  getOwner(): T | null { return this.entityOwner; }
  hasOwner(): boolean { return this.entityOwner !== null; }
  isGroup(): boolean { return this.entityMembers.length > 0; }
  getFirstChild(): T | null { return this.entityMembers[0] ?? null; }
  getNextBrother(): T | null {
    if (!this.entityOwner) return null;
    const siblings = this.entityOwner.entityMembers;
    return siblings[siblings.indexOf(this as unknown as T) + 1] ?? null;
  }
  getMembers(): IterableIterator<T> { return [...this.entityMembers].values(); }
  *getAllMembers(): IterableIterator<T> {
    for (const child of this.entityMembers) {
      yield child;
      yield* child.getAllMembers();
    }
  }
  getTop(): T {
    let result = this as unknown as T;
    while (result.entityOwner) result = result.entityOwner;
    return result;
  }
  getRoot(): T | null {
    const constructor = this.constructor as typeof HeaderModelAdapter;
    const first = constructor.all()[0] as T | undefined;
    return first?.getTop() ?? null;
  }
  isMemberOf(candidate: T | null): boolean {
    for (let current: T | null = this as unknown as T; current; current = current.entityOwner) {
      if (current === candidate) return true;
    }
    return false;
  }
  setOwner(owner: T | null): void {
    if (owner === this.entityOwner) return;
    const self = this as unknown as T;
    const ownerName = owner?.getName() ?? "";
    for (let current = owner; current; current = current.entityOwner) {
      if (current === self) {
        Environment.log(`Warning: Ignoring invalid hierarchy relation between "${this.entityName}" and "${ownerName}"`);
        return;
      }
    }
    if (this.entityOwner) {
      const siblings = this.entityOwner.entityMembers;
      const index = siblings.indexOf(this as unknown as T);
      if (index < 0) throw new LogicException("Invalid hierarchy data");
      siblings.splice(index, 1);
    }
    this.entityOwner = owner;
    owner?.entityMembers.push(this as unknown as T);
  }
  getHierarchyLevel(): number {
    let level = 0;
    for (let current = this.entityOwner; current; current = current.entityOwner) level += 1;
    return level;
  }
  sortMembers(): void { this.entityMembers.sort((left, right) => left.getName().localeCompare(right.getName())); }
  getType(): string { return this.constructor.name; }
  static override registerFields(): number { return 0; }
  protected disposeReferences(): void {}
  override dispose(): void {
    if (this.entityDisposed) return;
    this.entityDisposed = true;
    this.disposeReferences();
    const owner = this.entityOwner;
    const children = [...this.entityMembers];
    this.entityMembers.length = 0;
    if (owner) {
      const index = owner.entityMembers.indexOf(this as unknown as T);
      if (index < 0) throw new LogicException("Invalid hierarchy data");
      owner.entityMembers.splice(index, 1, ...children);
      for (const child of children) child.entityOwner = owner;
    } else {
      for (const child of children) child.entityOwner = null;
    }
    this.entityOwner = null;
    super.dispose();
  }

  override toJSON(): Record<string, AdapterValue> {
    const result: Record<string, AdapterValue> = { name: this.entityName };
    if (this.entityOwner) result.owner = this.entityOwner.getName();
    if (this.entityDescription) result.description = this.entityDescription;
    if (this.entityCategory) result.category = this.entityCategory;
    if (this.entitySubCategory) result.subcategory = this.entitySubCategory;
    if (this.entitySource) result.source = this.entitySource;
    if (this.entityHidden) result.hidden = true;
    return result;
  }
}

/**
 * Runtime equivalent of Association<A, B, C>::Node.  The native lists are
 * represented by ModelEntity reverse references, while this class preserves
 * one-time pointer assignment, effectivity and the shared association fields.
 */
export class AssociationEntity<A extends HeaderModelAdapter, B extends HeaderModelAdapter> extends HeaderModelAdapter {
  private associationA: A | null = null;
  private associationB: B | null = null;
  private associationAProperty: string | null = null;
  private associationBProperty: string | null = null;
  private associationEffective = new DateRange();
  private associationName = "";
  private associationPriority = 1;
  private associationSource = "";
  private associationHidden = false;
  private associationDisposed = false;

  protected assignPtrA(value: A | null, property: string): void {
    if (!value) return;
    if (this.associationA) throw new DataException("Can't reassign existing association");
    this.associationA = value;
    this.associationAProperty = property;
    const callback = Reflect.get(value, "modelReferenceAdded");
    if (typeof callback === "function") Reflect.apply(callback, value, [this, property]);
  }

  protected assignPtrB(value: B | null, property: string): void {
    if (!value) return;
    if (this.associationB) throw new DataException("Can't reassign existing association");
    this.associationB = value;
    this.associationBProperty = property;
    const callback = Reflect.get(value, "modelReferenceAdded");
    if (typeof callback === "function") Reflect.apply(callback, value, [this, property]);
  }

  protected getPtrA(): A | null { return this.associationA; }
  protected getPtrB(): B | null { return this.associationB; }
  getEffective(): DateRange { return new DateRange(this.associationEffective.getStart(), this.associationEffective.getEnd()); }
  getEffectiveStart(): PlanningDate { return this.associationEffective.getStart(); }
  getEffectiveEnd(): PlanningDate { return this.associationEffective.getEnd(); }
  setEffective(value: DateRange): void { this.associationEffective = new DateRange(value.getStart(), value.getEnd()); }
  setEffectiveStart(value: PlanningDate | string | number): void {
    this.associationEffective.setStart(value instanceof PlanningDate ? value : new PlanningDate(value));
  }
  setEffectiveEnd(value: PlanningDate | string | number): void {
    this.associationEffective.setEnd(value instanceof PlanningDate ? value : new PlanningDate(value));
  }
  getName(): string { return this.associationName; }
  setName(value: string): void { this.associationName = String(value); }
  getPriority(): number { return this.associationPriority; }
  setPriority(value: number): void { this.associationPriority = Math.trunc(Number(value)); }
  getSource(): string { return this.associationSource; }
  setSource(value: string): void { this.associationSource = String(value); }
  getHidden(): boolean { return this.associationHidden; }
  setHidden(value: boolean): void { this.associationHidden = Boolean(value); }

  override modelReferenceTargetDisposed(_target: HeaderModelAdapter, _property: string): void { this.dispose(); }

  override dispose(): void {
    if (this.associationDisposed) return;
    this.associationDisposed = true;
    if (this.associationA) {
      const callback = Reflect.get(this.associationA, "modelReferenceRemoved");
      if (typeof callback === "function") Reflect.apply(callback, this.associationA, [this, this.associationAProperty]);
    }
    if (this.associationB) {
      const callback = Reflect.get(this.associationB, "modelReferenceRemoved");
      if (typeof callback === "function") Reflect.apply(callback, this.associationB, [this, this.associationBProperty]);
    }
    this.associationA = null;
    this.associationB = null;
    this.associationAProperty = null;
    this.associationBProperty = null;
    super.dispose();
  }

  override toJSON(): Record<string, AdapterValue> {
    const result: Record<string, AdapterValue> = {
      name: this.associationName,
      priority: this.associationPriority,
      effective_start: this.associationEffective.getStart().toString(),
      effective_end: this.associationEffective.getEnd().toString(),
    };
    if (this.associationSource) result.source = this.associationSource;
    if (this.associationHidden) result.hidden = true;
    return result;
  }
}


export interface PortDefinition {
  readonly name: string;
  readonly sourceLine: number;
  readonly status: "adapted" | "ported";
}

export const PORT_MANIFEST = [
  { name: "ThreadSafeLogProxy::logger_base", sourceLine: 62, status: "adapted" },
  { name: "MetaCategory::defaultHash", sourceLine: 71, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 71, status: "adapted" },
  { name: "LibraryUtils::initialize", sourceLine: 75, status: "adapted" },
  { name: "frepple::LibraryUtils::initialize", sourceLine: 79, status: "adapted" },
  { name: "Environment::setProcessName", sourceLine: 86, status: "adapted" },
  { name: "xercesc::XMLPlatformUtils::Initialize", sourceLine: 89, status: "adapted" },
  { name: "Date::detectUTC", sourceLine: 91, status: "adapted" },
  { name: "Environment::searchFile", sourceLine: 96, status: "adapted" },
  { name: "Environment::getProcessorCores", sourceLine: 148, status: "adapted" },
  { name: "StreambufWrapper::setLogLimit", sourceLine: 163, status: "adapted" },
  { name: "StreambufWrapper::sync", sourceLine: 171, status: "adapted" },
  { name: "Environment::truncateLogFile", sourceLine: 175, status: "adapted" },
  { name: "Environment::setLogFile", sourceLine: 182, status: "adapted" },
  { name: "Date::now", sourceLine: 220, status: "adapted" },
  { name: "Environment::truncateLogFile", sourceLine: 223, status: "adapted" },
  { name: "Environment::getLogFileSize", sourceLine: 241, status: "adapted" },
  { name: "Environment::setProcessName", sourceLine: 248, status: "adapted" },
  { name: "MetaClass::addClass", sourceLine: 259, status: "adapted" },
  { name: "MetaCategory::findCategoryByTag", sourceLine: 263, status: "adapted" },
  { name: "Keyword::find", sourceLine: 272, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 276, status: "adapted" },
  { name: "MetaCategory::MetaCategory", sourceLine: 285, status: "adapted" },
  { name: "Keyword::find", sourceLine: 296, status: "adapted" },
  { name: "Keyword::find", sourceLine: 298, status: "adapted" },
  { name: "MetaCategory::findCategoryByTag", sourceLine: 311, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 313, status: "adapted" },
  { name: "MetaCategory::findCategoryByTag", sourceLine: 317, status: "adapted" },
  { name: "MetaCategory::findCategoryByGroupTag", sourceLine: 323, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 325, status: "adapted" },
  { name: "MetaCategory::findCategoryByGroupTag", sourceLine: 329, status: "adapted" },
  { name: "MetaCategory::findClass", sourceLine: 335, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 337, status: "adapted" },
  { name: "MetaCategory::findClass", sourceLine: 341, status: "adapted" },
  { name: "MetaClass::findClass", sourceLine: 347, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 349, status: "adapted" },
  { name: "MetaClass::findClass", sourceLine: 355, status: "adapted" },
  { name: "MetaClass::printClasses", sourceLine: 362, status: "adapted" },
  { name: "MetaClass::findField", sourceLine: 377, status: "adapted" },
  { name: "MetaClass::findField", sourceLine: 383, status: "adapted" },
  { name: "MetaClass::decodeAction", sourceLine: 389, status: "adapted" },
  { name: "MetaClass::decodeAction", sourceLine: 405, status: "adapted" },
  { name: "MetaClass::raiseEvent", sourceLine: 411, status: "adapted" },
  { name: "MetaCategory::ControllerDefault", sourceLine: 424, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface DatePort {
  detectUTC(...args: readonly PortValue[]): PortValue | void;
  now(...args: readonly PortValue[]): PortValue | void;
}

export interface EnvironmentPort {
  getLogFileSize(...args: readonly PortValue[]): PortValue | void;
  getProcessorCores(...args: readonly PortValue[]): PortValue | void;
  searchFile(...args: readonly PortValue[]): PortValue | void;
  setLogFile(...args: readonly PortValue[]): PortValue | void;
  setProcessName(...args: readonly PortValue[]): PortValue | void;
  truncateLogFile(...args: readonly PortValue[]): PortValue | void;
}

export interface KeywordPort {
  find(...args: readonly PortValue[]): PortValue | void;
  hash(...args: readonly PortValue[]): PortValue | void;
}

export interface LibraryUtilsPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface MetaCategoryPort {
  ControllerDefault(...args: readonly PortValue[]): PortValue | void;
  MetaCategory(...args: readonly PortValue[]): PortValue | void;
  defaultHash(...args: readonly PortValue[]): PortValue | void;
  findCategoryByGroupTag(...args: readonly PortValue[]): PortValue | void;
  findCategoryByTag(...args: readonly PortValue[]): PortValue | void;
  findClass(...args: readonly PortValue[]): PortValue | void;
}

export interface MetaClassPort {
  addClass(...args: readonly PortValue[]): PortValue | void;
  decodeAction(...args: readonly PortValue[]): PortValue | void;
  findClass(...args: readonly PortValue[]): PortValue | void;
  findField(...args: readonly PortValue[]): PortValue | void;
  printClasses(...args: readonly PortValue[]): PortValue | void;
  raiseEvent(...args: readonly PortValue[]): PortValue | void;
}

export interface StreambufWrapperPort {
  setLogLimit(...args: readonly PortValue[]): PortValue | void;
  sync(...args: readonly PortValue[]): PortValue | void;
}

export interface ThreadSafeLogProxyPort {
  logger_base(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLPlatformUtilsPort {
  Initialize(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/library.cpp";
export const targetFile = "utils/library.ts";

export enum Action {
  ADD = 0,
  CHANGE = 1,
  REMOVE = 2,
  ADD_CHANGE = 3,
}

export enum Signal {
  SIG_ADD = 0,
  SIG_REMOVE = 1,
}

export class DataException extends Error {
  override readonly name: string = "DataException";
}

export class LogicException extends Error {
  override readonly name: string = "LogicException";
}

export class RuntimeException extends Error {
  override readonly name: string = "RuntimeException";
}

/** Stable keyword registry and FNV-1a hash adapter. */
export class Keyword {
  private static readonly tags = new Map<number, Keyword>();
  readonly name: string;
  readonly fullName: string;
  readonly hashValue: number;

  constructor(name: string, namespace?: string) {
    if (!name) throw new LogicException("Creating keyword without name");
    if (namespace === "") throw new LogicException("Creating keyword with empty namespace");
    this.name = name;
    this.fullName = namespace ? `${namespace}:${name}` : name;
    this.hashValue = Keyword.hash(name);
    const existing = Keyword.tags.get(this.hashValue);
    if (existing && existing.name !== name) {
      throw new LogicException(`Tag hash function clashes for ${existing.name} and ${name}`);
    }
    Keyword.tags.set(this.hashValue, this);
  }

  static hash(text: string): number {
    let value = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 0x01000193);
    }
    return value >>> 0;
  }

  static find(name: string): Keyword {
    const hash = Keyword.hash(name);
    return Keyword.tags.get(hash) ?? new Keyword(name);
  }

  static getTags(): ReadonlyMap<number, Keyword> {
    return Keyword.tags;
  }

  getName(): string {
    return this.name;
  }

  getHash(): number {
    return this.hashValue;
  }

  toString(): string {
    return this.fullName;
  }
}

export interface DataValueDict {
  get(key: string | Keyword): unknown;
}

export interface MetaFieldOptions<TObject extends object, TValue> {
  readonly keyword: Keyword;
  readonly flags?: number;
  readonly get: (object: TObject) => TValue;
  readonly set?: (object: TObject, value: TValue) => void;
  readonly defaultValue?: TValue;
}

export class MetaFieldBase<TObject extends object = object, TValue = unknown> {
  readonly keyword: Keyword;
  readonly flags: number;
  readonly defaultValue: TValue | undefined;
  private readonly getter: (object: TObject) => TValue;
  private readonly setter: ((object: TObject, value: TValue) => void) | undefined;

  constructor(options: MetaFieldOptions<TObject, TValue>) {
    this.keyword = options.keyword;
    this.flags = options.flags ?? 0;
    this.defaultValue = options.defaultValue;
    this.getter = options.get;
    this.setter = options.set;
  }

  getName(): Keyword {
    return this.keyword;
  }

  getHash(): number {
    return this.keyword.hashValue;
  }

  getFlag(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }

  getField(object: TObject): TValue {
    return this.getter(object);
  }

  setField(object: TObject, value: TValue): void {
    if (!this.setter) throw new LogicException(`Field ${this.keyword.name} is read-only`);
    this.setter(object, value);
  }

  isPointer(): boolean {
    return false;
  }

  isGroup(): boolean {
    return false;
  }
}

export type MetaFactory<T extends object = object> = () => T;
export type EventSubscriber<T extends object = object> = (object: T, signal: Signal) => boolean;

export class MetaClass<T extends object = object> {
  private static readonly allClasses = new Map<string, MetaClass<never>>();
  readonly type: string;
  readonly typeTag: Keyword;
  readonly category: MetaCategory | null;
  readonly isDefault: boolean;
  readonly factoryMethod: MetaFactory<T> | null;
  readonly fields: MetaFieldBase<T, unknown>[] = [];
  parent = false;
  private readonly subscribers = new Map<Signal, Set<EventSubscriber<T>>>();

  constructor(
    type = "unspecified",
    options: {
      category?: MetaCategory;
      default?: boolean;
      factory?: MetaFactory<T>;
    } = {},
  ) {
    this.type = type || "unspecified";
    this.typeTag = Keyword.find(this.type);
    this.category = options.category ?? null;
    this.isDefault = options.default ?? false;
    this.factoryMethod = options.factory ?? null;
    MetaClass.allClasses.set(this.type, this as unknown as MetaClass<never>);
    this.category?.addClass(this as unknown as MetaClass<object>);
  }

  static registerClass<T extends object>(
    category: string | MetaCategory,
    type: string,
    factory?: MetaFactory<T>,
    isDefault = false,
  ): MetaClass<T> {
    const owner = typeof category === "string" ? MetaCategory.findCategoryByTag(category) : category;
    if (!owner) throw new LogicException(`Category ${String(category)} not found when registering class ${type}`);
    return new MetaClass<T>(type, { category: owner, default: isDefault, ...(factory ? { factory } : {}) });
  }

  static findClass(name: string): MetaClass<object> | null {
    return (MetaClass.allClasses.get(name) as unknown as MetaClass<object> | undefined) ?? null;
  }

  static decodeAction(value: string | DataValueDict | null | undefined): Action {
    const raw = typeof value === "object" && value !== null
      ? value.get(Keyword.find("action"))
      : value;
    if (raw === undefined || raw === null || raw === "") return Action.ADD_CHANGE;
    if (raw === "AC") return Action.ADD_CHANGE;
    if (raw === "A") return Action.ADD;
    if (raw === "C") return Action.CHANGE;
    if (raw === "R") return Action.REMOVE;
    throw new DataException(`Invalid action '${String(raw)}'`);
  }

  addField<TValue>(field: MetaFieldBase<T, TValue>): void {
    this.fields.push(field as MetaFieldBase<T, unknown>);
  }

  findField(key: string | number | Keyword): MetaFieldBase<T, unknown> | null {
    const hash = typeof key === "number" ? key : typeof key === "string" ? Keyword.hash(key) : key.hashValue;
    return this.fields.find((field) => field.getHash() === hash) ?? null;
  }

  connect(subscriber: EventSubscriber<T>, signal: Signal): void {
    const list = this.subscribers.get(signal) ?? new Set<EventSubscriber<T>>();
    list.add(subscriber);
    this.subscribers.set(signal, list);
  }

  disconnect(subscriber: EventSubscriber<T>, signal: Signal): void {
    this.subscribers.get(signal)?.delete(subscriber);
  }

  raiseEvent(object: T, signal: Signal): boolean {
    let accepted = true;
    for (const subscriber of this.subscribers.get(signal) ?? []) {
      if (!subscriber(object, signal)) accepted = false;
    }
    const category = this.category as MetaCategory<T> | null;
    return category ? accepted && category.raiseEvent(object, signal) : accepted;
  }
}

export class MetaCategory<T extends object = object> extends MetaClass<T> {
  private static readonly categoriesByTag = new Map<number, MetaCategory<never>>();
  private static readonly categoriesByGroupTag = new Map<number, MetaCategory<never>>();
  readonly group: string;
  readonly groupTag: Keyword;
  private readonly classes = new Map<number, MetaClass<T>>();

  constructor(type: string, group: string) {
    super(type);
    this.group = group || "unspecified";
    this.groupTag = Keyword.find(this.group);
    MetaCategory.categoriesByTag.set(this.typeTag.hashValue, this as unknown as MetaCategory<never>);
    MetaCategory.categoriesByGroupTag.set(this.groupTag.hashValue, this as unknown as MetaCategory<never>);
  }

  static registerCategory<T extends object>(type: string, group: string): MetaCategory<T> {
    return new MetaCategory<T>(type, group);
  }

  static findCategoryByTag(tag: string | number): MetaCategory<object> | null {
    const hash = typeof tag === "number" ? tag : Keyword.hash(tag);
    return (MetaCategory.categoriesByTag.get(hash) as unknown as MetaCategory<object> | undefined) ?? null;
  }

  static findCategoryByGroupTag(tag: string | number): MetaCategory<object> | null {
    const hash = typeof tag === "number" ? tag : Keyword.hash(tag);
    return (MetaCategory.categoriesByGroupTag.get(hash) as unknown as MetaCategory<object> | undefined) ?? null;
  }

  addClass(metaClass: MetaClass<T>): void {
    this.classes.set(metaClass.typeTag.hashValue, metaClass);
    if (metaClass.isDefault) this.classes.set(Keyword.hash("default"), metaClass);
  }

  setDefaultClass(metaClass: MetaClass<T>): void {
    this.classes.set(Keyword.hash("default"), metaClass);
  }

  findClass(type: string | number): MetaClass<T> | null {
    const hash = typeof type === "number" ? type : Keyword.hash(type);
    return this.classes.get(hash) ?? null;
  }

  controllerDefault(values: DataValueDict): T {
    const action = MetaClass.decodeAction(values);
    if (action === Action.REMOVE || action === Action.CHANGE) {
      throw new DataException(`Entity ${this.type} doesn't support this action`);
    }
    const type = values.get(Keyword.find("type"));
    const metaClass = this.findClass(typeof type === "string" ? type : "default");
    if (!metaClass?.factoryMethod) throw new LogicException(`No type ${String(type ?? "default")} registered for category ${this.type}`);
    const object = metaClass.factoryMethod();
    if (!metaClass.raiseEvent(object, Signal.SIG_ADD)) throw new DataException("Can't create object");
    return object;
  }
}

/** Interned immutable strings; equality is deterministic by value in JS. */
export class PooledString {
  private static readonly pool = new Map<string, string>();
  private value: string;

  constructor(value = "") {
    this.value = PooledString.intern(value);
  }

  static getSize(): readonly [number, number] {
    let characters = 0;
    for (const value of PooledString.pool.values()) characters += value.length;
    return [PooledString.pool.size, characters * 2];
  }

  assign(value: string | PooledString): void {
    this.value = PooledString.intern(String(value));
  }

  empty(): boolean {
    return this.value.length === 0;
  }

  contains(value: string): boolean {
    return this.value.includes(value);
  }

  at(position: number): string {
    return this.value.at(position) ?? "\0";
  }

  front(): string {
    return this.value.at(0) ?? "\0";
  }

  back(): string {
    return this.value.at(-1) ?? "\0";
  }

  hash(): number {
    return Keyword.hash(this.value);
  }

  toString(): string {
    return this.value;
  }

  private static intern(value: string): string {
    if (!value) return "";
    const existing = PooledString.pool.get(value);
    if (existing !== undefined) return existing;
    PooledString.pool.set(value, value);
    return value;
  }
}

export class Environment {
  private static processorCores: number | null = null;
  private static logFilename = "";
  private static logLimit = 0;

  static getProcessorCores(): number {
    if (Environment.processorCores !== null) return Environment.processorCores;
    const configured = Number(process.env.FREPPLE_CPU ?? 0);
    const detected = Number(globalThis.navigator?.hardwareConcurrency ?? 1);
    Environment.processorCores = configured > 0 ? Math.trunc(configured) : Math.max(1, Math.trunc(detected));
    return Environment.processorCores;
  }

  static searchFile(filename: string): string {
    if (!filename) return "";
    if (existsSync(filename)) return filename;
    const home = process.env.FREPPLE_HOME;
    if (!home) return "";
    const candidate = isAbsolute(filename) ? filename : join(home, filename);
    return existsSync(candidate) ? candidate : "";
  }

  static setLogFile(filename: string): void {
    if (filename.startsWith("+") && filename !== "+") throw new RuntimeException("Appending to a log file is no longer supported");
    Environment.logFilename = filename === "+" ? "" : filename;
    if (Environment.logFilename) writeFileSync(Environment.logFilename, "", "utf8");
  }

  static getLogFile(): string { return Environment.logFilename; }
  static setloglimit(limit: number): void { Environment.logLimit = Math.max(0, Math.trunc(limit)); }
  static getloglimit(): number { return Environment.logFilename ? Environment.logLimit : 0; }
  static getLogFileSize(): number {
    if (!Environment.logFilename) return 0;
    try { return statSync(Environment.logFilename).size; } catch { return 0; }
  }
  static truncateLogFile(size: number): void {
    if (Environment.logFilename && existsSync(Environment.logFilename)) truncateSync(Environment.logFilename, Math.max(0, Math.trunc(size)));
  }
  static log(message: string): void {
    const text = message.endsWith("\n") ? message : `${message}\n`;
    if (Environment.logFilename) appendFileSync(Environment.logFilename, text, "utf8");
    else process.stdout.write(text);
  }
  static setProcessName(): void {}
}

export class LibraryUtils {
  private static initialized = false;

  static initialize(): void {
    if (LibraryUtils.initialized) return;
    LibraryUtils.initialized = true;
  }
}

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
  "// These headers are required for the loading of dynamic libraries and the",
  "// detection of the number of cores.",
  "#include <dlfcn.h>",
  "#include <unistd.h>",
  "#include <sys/stat.h>",
  "",
  "#include \"frepple/utils.h\"",
  "#include \"frepple/xml.h\"",
  "#ifdef HAVE_SYS_PRCTL_H",
  "#include <sys/prctl.h>",
  "#endif",
  "",
  "namespace frepple::utils {",
  "",
  "// Static stringpool table",
  "set<string> PooledString::pool;",
  "mutex PooledString::pool_lock;",
  "const PooledString PooledString::emptystring;",
  "const string PooledString::nullstring;",
  "const char PooledString::nullchar = '\\0';",
  "",
  "// Repository of all categories and commands",
  "const MetaCategory* MetaCategory::firstCategory = nullptr;",
  "MetaCategory::CategoryMap MetaCategory::categoriesByTag;",
  "MetaCategory::CategoryMap MetaCategory::categoriesByGroupTag;",
  "",
  "const MetaCategory* Object::metadata = nullptr;",
  "",
  "// Number of processors.",
  "// The value initialized here is updated when the getProcessorCores function",
  "// is called the first time.",
  "int Environment::processorcores = -1;",
  "",
  "// Output logging stream, whose input buffer is shared with either",
  "// Environment::logfile or cout.",
  "mutex ThreadSafeLogProxy::log_mutex;",
  "ostream ThreadSafeLogProxy::logger_base(cout.rdbuf());",
  "",
  "// Output file stream",
  "StreambufWrapper Environment::logfile;",
  "",
  "// Name of the log file",
  "string Environment::logfilename;",
  "",
  "// Hash value computed only once",
  "const size_t MetaCategory::defaultHash(Keyword::hash(\"default\"));",
  "",
  "vector<PythonType*> Object::table;",
  "",
  "void LibraryUtils::initialize() {",
  "  // Initialize only once",
  "  static bool init = false;",
  "  if (init) {",
  "    logger << \"Warning: Calling frepple::LibraryUtils::initialize() more \"",
  "           << \"than once.\\n\";",
  "    return;",
  "  }",
  "  init = true;",
  "",
  "  // Set the process name",
  "  Environment::setProcessName();",
  "",
  "  // Initialize Xerces parser",
  "  xercesc::XMLPlatformUtils::Initialize();",
  "  PythonInterpreter::initialize();",
  "  Date::detectUTC(tzname[0]);",
  "  if (CommandManager::initialize())",
  "    throw RuntimeException(\"Error registering command manager\");",
  "}",
  "",
  "string Environment::searchFile(const string& filename) {",
  "  static char pathseperator = '/';",
  "",
  "  // First: check the current directory",
  "  struct stat stat_p;",
  "  int result = stat(filename.c_str(), &stat_p);",
  "  if (!result && (stat_p.st_mode & S_IREAD)) return filename;",
  "",
  "  // Second: check the FREPPLE_HOME directory, if it is defined",
  "  string fullname;",
  "  char* envvar = getenv(\"FREPPLE_HOME\");",
  "  if (envvar) {",
  "    fullname = envvar;",
  "    if (*fullname.rbegin() != pathseperator) fullname += pathseperator;",
  "    fullname += filename;",
  "    result = stat(fullname.c_str(), &stat_p);",
  "    if (!result && (stat_p.st_mode & S_IREAD)) return fullname;",
  "  }",
  "",
  "#ifdef DATADIRECTORY",
  "  // Third: check the data directory",
  "  fullname = DATADIRECTORY;",
  "  if (*fullname.rbegin() != pathseperator) fullname += pathseperator;",
  "  fullname.append(filename);",
  "  result = stat(fullname.c_str(), &stat_p);",
  "  if (!result && (stat_p.st_mode & S_IREAD)) return fullname;",
  "#endif",
  "",
  "#ifdef LIBDIRECTORY",
  "  // Fourth: check the lib directory",
  "  fullname = LIBDIRECTORY;",
  "  if (*fullname.rbegin() != pathseperator) fullname += pathseperator;",
  "  fullname += \"frepple\";",
  "  fullname += pathseperator;",
  "  fullname += filename;",
  "  result = stat(fullname.c_str(), &stat_p);",
  "  if (!result && (stat_p.st_mode & S_IREAD)) return fullname;",
  "#endif",
  "",
  "#ifdef SYSCONFDIRECTORY",
  "  // Fifth: check the sysconf directory",
  "  fullname = SYSCONFDIRECTORY;",
  "  if (*fullname.rbegin() != pathseperator) fullname += pathseperator;",
  "  fullname += filename;",
  "  result = stat(fullname.c_str(), &stat_p);",
  "  if (!result && (stat_p.st_mode & S_IREAD)) return fullname;",
  "#endif",
  "",
  "  // Not found",
  "  return \"\";",
  "}",
  "",
  "int Environment::getProcessorCores() {",
  "  // Previously detected already",
  "  if (processorcores >= 1) return processorcores;",
  "",
  "  char* envvar = getenv(\"FREPPLE_CPU\");",
  "  if (envvar)",
  "    // Environment variable overrides the default (if it is a valid number)",
  "    processorcores = atoi(envvar);",
  "  if (processorcores < 0)",
  "    // Autodetect the number of cores on your machine",
  "    processorcores = thread::hardware_concurrency();",
  "  if (processorcores < 1) processorcores = 1;",
  "  return processorcores;",
  "}",
  "",
  "void StreambufWrapper::setLogLimit(unsigned long long i) {",
  "  if (!max_size) {",
  "    start_size = Environment::getLogFileSize();",
  "    cur_size = 0;",
  "  }",
  "  max_size = i;",
  "}",
  "",
  "int StreambufWrapper::sync() {",
  "  if (max_size && ++cur_size > max_size) {",
  "    cur_size = 0;",
  "    auto r = filebuf::sync();",
  "    Environment::truncateLogFile(start_size);",
  "    logger << \"\\nTruncated some output here...\\n\\n\";",
  "    return r;",
  "  } else",
  "    return filebuf::sync();",
  "}",
  "",
  "void Environment::setLogFile(const string& x) {",
  "  // Bye bye message",
  "  if (!logfilename.empty()) logger << \"Stop logging at \" << Date::now() << '\\n';",
  "",
  "  // Close an eventual existing log file.",
  "  if (logfile.is_open()) logfile.close();",
  "",
  "  // No new logfile specified: redirect to the standard output stream",
  "  if (x.empty() || x == \"+\") {",
  "    logfilename = x;",
  "    logger.rdbuf(cout.rdbuf());",
  "    return;",
  "  }",
  "",
  "  // Open the file: either as a new file, either appending to existing file",
  "  if (x[0] == '+')",
  "    throw RuntimeException(\"Appending to a log file is no longer supported\");",
  "  auto status = logfile.open(x.c_str(), ios::out);",
  "  if (!status) {",
  "    // Redirect to the previous logfile (or cout if that's not possible)",
  "    if (logfile.is_open()) logfile.close();",
  "    status = logfile.open(logfilename.c_str(), ios::app);",
  "    if (status)",
  "      logger.rdbuf(&logfile);",
  "    else",
  "      logger.rdbuf(cout.rdbuf());",
  "    // The log file could not be opened",
  "    throw RuntimeException(\"Could not open log file '\" + x + \"'\");",
  "  }",
  "",
  "  // Store the file name",
  "  logfilename = x;",
  "",
  "  // Redirect the log file.",
  "  logger.rdbuf(&logfile);",
  "",
  "  // Print a nice header",
  "  logger << \"Start logging frePPLe \" << PACKAGE_VERSION << \" (\" << __DATE__",
  "         << \") at \" << Date::now() << '\\n';",
  "}",
  "",
  "void Environment::truncateLogFile(unsigned long long sz) {",
  "  if (logfilename.empty()) return;",
  "",
  "  // Close an eventual existing log file.",
  "  if (logfile.is_open()) logfile.close();",
  "",
  "#ifdef HAVE_TRUNCATE",
  "  // Resize the file",
  "  if (truncate(logfilename.c_str(), sz))",
  "    logger << \"Error: Failed to truncate log file\\n\";",
  "#else",
  "#error \"This platform doesn't have a file resizing api.\"",
  "#endif",
  "",
  "  // Reopen the file",
  "  logfile.open(logfilename.c_str(), ios::app);",
  "}",
  "",
  "unsigned long Environment::getLogFileSize() {",
  "  if (logfilename.empty()) return 0;",
  "  struct stat statbuf;",
  "  auto f = stat(logfilename.c_str(), &statbuf);",
  "  return f != -1 ? statbuf.st_size : 0;",
  "}",
  "",
  "void Environment::setProcessName() {",
  "#ifdef HAVE_PRCTL",
  "  char* envvar = getenv(\"FREPPLE_PROCESSNAME\");",
  "  if (envvar) {",
  "    string nm = \"frepple \";",
  "    nm += envvar;",
  "    prctl(PR_SET_NAME, nm.c_str());",
  "  }",
  "#endif",
  "}",
  "",
  "void MetaClass::addClass(const string& a, const string& b, bool,",
  "                         creatorDefault f) {",
  "  // Find or create the category",
  "  auto* cat =",
  "      const_cast<MetaCategory*>(MetaCategory::findCategoryByTag(a.c_str()));",
  "",
  "  // Check for a valid category",
  "  if (!cat)",
  "    throw LogicException(\"Category \" + a +",
  "                         \" not found when registering class \" + b);",
  "",
  "  // Update fields",
  "  type = b.empty() ? \"unspecified\" : b;",
  "  typetag = &Keyword::find(type.c_str());",
  "  category = cat;",
  "",
  "  // Update the metadata table",
  "  cat->classes[Keyword::hash(b)] = this;",
  "",
  "  // Register this tag also as the default one, if requested",
  "  if (isDefault) cat->classes[Keyword::hash(\"default\")] = this;",
  "",
  "  // Set method pointers to nullptr",
  "  factoryMethod = f;",
  "}",
  "",
  "MetaCategory::MetaCategory(const string& a, const string& gr, size_t sz,",
  "                           readController f, findController s) {",
  "  // Update registry",
  "  if (!a.empty()) categoriesByTag[Keyword::hash(a)] = this;",
  "  if (!gr.empty()) categoriesByGroupTag[Keyword::hash(gr)] = this;",
  "",
  "  // Update fields",
  "  size = sz;",
  "  readFunction = f;",
  "  findFunction = s;",
  "  type = a.empty() ? \"unspecified\" : a;",
  "  typetag = &Keyword::find(type.c_str());",
  "  group = gr.empty() ? \"unspecified\" : gr;",
  "  grouptag = &Keyword::find(group.c_str());",
  "",
  "  // Maintain a linked list of all registered categories",
  "  nextCategory = nullptr;",
  "  if (!firstCategory)",
  "    firstCategory = this;",
  "  else {",
  "    const MetaCategory* i = firstCategory;",
  "    while (i->nextCategory) i = i->nextCategory;",
  "    const_cast<MetaCategory*>(i)->nextCategory = this;",
  "  }",
  "}",
  "",
  "const MetaCategory* MetaCategory::findCategoryByTag(const char* c) {",
  "  // Loop through all categories",
  "  auto i = categoriesByTag.find(Keyword::hash(c));",
  "  return (i != categoriesByTag.end()) ? i->second : nullptr;",
  "}",
  "",
  "const MetaCategory* MetaCategory::findCategoryByTag(const size_t h) {",
  "  // Loop through all categories",
  "  auto i = categoriesByTag.find(h);",
  "  return (i != categoriesByTag.end()) ? i->second : nullptr;",
  "}",
  "",
  "const MetaCategory* MetaCategory::findCategoryByGroupTag(const char* c) {",
  "  // Loop through all categories",
  "  auto i = categoriesByGroupTag.find(Keyword::hash(c));",
  "  return (i != categoriesByGroupTag.end()) ? i->second : nullptr;",
  "}",
  "",
  "const MetaCategory* MetaCategory::findCategoryByGroupTag(const size_t h) {",
  "  // Loop through all categories",
  "  auto i = categoriesByGroupTag.find(h);",
  "  return (i != categoriesByGroupTag.end()) ? i->second : nullptr;",
  "}",
  "",
  "const MetaClass* MetaCategory::findClass(const char* c) const {",
  "  // Look up in the registered classes",
  "  auto j = classes.find(Keyword::hash(c));",
  "  return (j == classes.end()) ? nullptr : j->second;",
  "}",
  "",
  "const MetaClass* MetaCategory::findClass(const size_t h) const {",
  "  // Look up in the registered classes",
  "  auto j = classes.find(h);",
  "  return (j == classes.end()) ? nullptr : j->second;",
  "}",
  "",
  "const MetaClass* MetaClass::findClass(const char* c) {",
  "  for (auto i : MetaCategory::categoriesByTag) {",
  "    auto j = i.second->classes.find(Keyword::hash(c));",
  "    if (j != i.second->classes.end()) return j->second;",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "const MetaClass* MetaClass::findClass(PyObject* pytype) {",
  "  for (auto i : MetaCategory::categoriesByTag)",
  "    for (auto& j : i.second->classes)",
  "      if ((PyObject*)(j.second->pythonClass) == pytype) return j.second;",
  "  return nullptr;",
  "}",
  "",
  "void MetaClass::printClasses() {",
  "  logger << \"Registered classes:\\n\";",
  "  // Loop through all categories",
  "  for (auto& i : MetaCategory::categoriesByTag) {",
  "    logger << \"  \" << i.second->type << '\\n';",
  "    // Loop through the classes for the category",
  "    for (auto j = i.second->classes.begin(); j != i.second->classes.end(); ++j)",
  "      if (j->first == Keyword::hash(\"default\"))",
  "        logger << \"    default ( = \" << j->second->type << \" )\" << j->second",
  "               << '\\n';",
  "      else",
  "        logger << \"    \" << j->second->type << j->second << '\\n';",
  "  }",
  "}",
  "",
  "const MetaFieldBase* MetaClass::findField(const Keyword& key) const {",
  "  for (auto field : fields)",
  "    if (field->getName() == key) return field;",
  "  return nullptr;",
  "}",
  "",
  "const MetaFieldBase* MetaClass::findField(size_t h) const {",
  "  for (auto field : fields)",
  "    if (field->getHash() == h) return field;",
  "  return nullptr;",
  "}",
  "",
  "Action MetaClass::decodeAction(const char* x) {",
  "  // Validate the action",
  "  if (!x)",
  "    throw LogicException(\"Invalid action nullptr\");",
  "  else if (!strcmp(x, \"AC\"))",
  "    return Action::ADD_CHANGE;",
  "  else if (!strcmp(x, \"A\"))",
  "    return Action::ADD;",
  "  else if (!strcmp(x, \"C\"))",
  "    return Action::CHANGE;",
  "  else if (!strcmp(x, \"R\"))",
  "    return Action::REMOVE;",
  "  else",
  "    throw DataException(\"Invalid action '\" + string(x) + \"'\");",
  "}",
  "",
  "Action MetaClass::decodeAction(const DataValueDict& atts) {",
  "  // Decode the string and return the default in the absence of the attribute",
  "  const DataValue* c = atts.get(Tags::action);",
  "  return c ? decodeAction(c->getString().c_str()) : Action::ADD_CHANGE;",
  "}",
  "",
  "bool MetaClass::raiseEvent(Object* v, Signal a) const {",
  "  bool result(true);",
  "  for (auto i = subscribers[a].begin(); i != subscribers[a].end(); ++i)",
  "    // Note that we always call all subscribers, even if one or more",
  "    // already replied negatively. However, an exception thrown from a",
  "    // callback method will break the publishing chain.",
  "    if (!(*i)->callback(v, a)) result = false;",
  "",
  "  // Raise the event also on the category, if there is a valid one",
  "  return (category && category != this) ? (result && category->raiseEvent(v, a))",
  "                                        : result;",
  "}",
  "",
  "Object* MetaCategory::ControllerDefault(const MetaClass* cat,",
  "                                        const DataValueDict& in,",
  "                                        CommandManager* mgr) {",
  "  Action act = MetaClass::decodeAction(in);",
  "  switch (act) {",
  "    case Action::REMOVE:",
  "      throw DataException(\"Entity \" + cat->type +",
  "                          \" doesn't support REMOVE action\");",
  "    case Action::CHANGE:",
  "      throw DataException(\"Entity \" + cat->type +",
  "                          \" doesn't support CHANGE action\");",
  "    default:",
  "      /* Lookup the class in the map of registered classes. */",
  "      const MetaClass* j;",
  "      if (cat->category)",
  "        // Class metadata passed: we already know what type to create",
  "        j = cat;",
  "      else {",
  "        // Category metadata passed: we need to look up the type",
  "        const DataValue* type = in.get(Tags::type);",
  "        j = static_cast<const MetaCategory&>(*cat).findClass(",
  "            type ? Keyword::hash(type->getString())",
  "                 : MetaCategory::defaultHash);",
  "        if (!j) {",
  "          string t(type ? type->getString() : \"default\");",
  "          throw LogicException(\"No type \" + t + \" registered for category \" +",
  "                               cat->type);",
  "        }",
  "      }",
  "",
  "      // Call the factory method",
  "      assert(j->factoryMethod);",
  "      Object* result = j->factoryMethod();",
  "",
  "      // Run the callback methods",
  "      if (!result->getType().raiseEvent(result, SIG_ADD)) {",
  "        // Creation denied",
  "        delete result;",
  "        throw DataException(\"Can't create object\");",
  "      }",
  "",
  "      // Report the creation to the manager",
  "      if (mgr) mgr->add(new CommandCreateObject(result));",
  "",
  "      // Creation accepted",
  "      return result;",
  "  }",
  "  throw LogicException(\"Unreachable code reached\");",
  "  return nullptr;",
  "}",
  "",
  "}  // namespace frepple::utils",
];
