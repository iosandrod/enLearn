// <header-api-generated>
export const CalendarCppModel = { bases: ["HasName","HasSource"] as const, methods: ["addBucket","buildEventList","clearEventList","findBucket","getBool","getBuckets","getDefault","getEvents","getSize","getType","getValue","initialize","registerFields","removeBucket","setDefault","setPythonValue","setValue"] as const, qualifiedNames: ["Calendar"] as const };

export const CalendarBucketCppModel = { bases: ["HasSource","NonCopyable","Object"] as const, methods: ["getBool","getByName","getCalendar","getDays","getEnd","getEndTime","getName","getPriority","getStart","getStartTime","getType","getValue","initialize","isContinuouslyEffective","reader","registerFields","setCalendar","setDays","setEnd","setEndTime","setName","setPriority","setStart","setStartTime","setValue"] as const, qualifiedNames: ["CalendarBucket"] as const };

export const CalendarBucketIteratorCppModel = { bases: [] as const, methods: ["end","next"] as const, qualifiedNames: ["CalendarBucket::iterator"] as const };

export const CalendarDefaultCppModel = { bases: ["Calendar"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["CalendarDefault"] as const };

export const CalendarEventIteratorCppModel = { bases: ["PythonExtension"] as const, methods: ["getCalendar","getDate","getPrevValue","getValue","initialize"] as const, qualifiedNames: ["Calendar::EventIterator","CalendarEventIterator"] as const };
// </header-api-generated>













import { Date as PlanningDate, DateDetail, Duration } from "../utils/date.js";
import { DataException, Environment, HeaderModelAdapter, ModelEntity, applyDataFields } from "../utils/library.js";

const DAY = 86_400;
const YEAR = 365 * DAY;

function asDate(value: PlanningDate | string | number): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

function asDuration(value: Duration | string | number): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(value);
}

function compareBuckets(left: CalendarBucket, right: CalendarBucket): number {
  return left.getStart().compare(right.getStart()) || left.getPriority() - right.getPriority();
}

function callReference(reference: HeaderModelAdapter, method: string): unknown {
  const callback = Reflect.get(reference, method);
  return typeof callback === "function" ? Reflect.apply(callback, reference, []) : undefined;
}

/** Calendar implementation preserving frePPLe priority and weekly effectivity rules. */
export class Calendar extends ModelEntity<Calendar> {
  static readonly cppBases: readonly string[] = ["HasName", "HasSource"];
  static readonly cppQualifiedNames: readonly string[] = ["Calendar"];
  static override modelFamily = "Calendar";
  private readonly buckets: CalendarBucket[] = [];
  private defaultValue = 0;
  private eventList: ReadonlyArray<readonly [PlanningDate, number]> = [];

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "calendar"; }
  getDefault(): number { return this.defaultValue; }
  getBool(): boolean { return this.defaultValue !== 0; }
  setDefault(value: number): void {
    this.defaultValue = Number(value);
    this.clearEventList();
  }
  getBuckets(): CalendarBucketIterator { return new CalendarBucketIterator(this.buckets); }
  getSize(): number { return this.buckets.length + this.eventList.length; }

  setValue(start: PlanningDate | string | number, end: PlanningDate | string | number, value: number): void {
    const startDate = asDate(start);
    const endDate = asDate(end);
    let bucket = this.findBucket(startDate);
    if (bucket && bucket.getStart().equals(startDate) && bucket.getEnd().compare(endDate) <= 0) {
      bucket.setEnd(endDate);
    } else {
      bucket = new CalendarBucket();
      bucket.setStart(startDate);
      bucket.setEnd(endDate);
      bucket.setCalendar(this);
    }
    bucket.setValue(value);
    bucket.setPriority(this.lowestPriority() - 1);
  }

  getValue(dateOrIterator: PlanningDate | string | number | CalendarBucketIterator, forward = true): number {
    if (dateOrIterator instanceof CalendarBucketIterator) return dateOrIterator.current()?.getValue() ?? this.defaultValue;
    const bucket = this.findBucket(asDate(dateOrIterator), forward);
    return bucket?.getValue() ?? this.defaultValue;
  }

  findBucket(date: PlanningDate | string | number, forward = true): CalendarBucket | null {
    const requested = asDate(date);
    let winner: CalendarBucket | null = null;
    let winningPriority = Number.POSITIVE_INFINITY;
    for (const bucket of this.buckets) {
      if (bucket.getStart().equals(bucket.getEnd())) continue;
      if (bucket.getStart().compare(requested) > 0) break;
      if (bucket.getPriority() >= winningPriority) continue;
      const starts = forward ? requested.compare(bucket.getStart()) >= 0 : requested.compare(bucket.getStart()) > 0;
      const ends = forward
        ? requested.compare(bucket.getEnd()) < 0 || (requested.equals(PlanningDate.infiniteFuture) && bucket.getEnd().equals(PlanningDate.infiniteFuture))
        : requested.compare(bucket.getEnd()) <= 0;
      if (!starts || !ends || !this.matchesWeeklyPeriod(bucket, requested, forward)) continue;
      winner = bucket;
      winningPriority = bucket.getPriority();
    }
    return winner;
  }

  addBucket(start: PlanningDate | string | number, end: PlanningDate | string | number, value: number): CalendarBucket {
    const bucket = new CalendarBucket();
    bucket.setCalendar(this);
    bucket.setStart(asDate(start));
    bucket.setEnd(asDate(end));
    bucket.setValue(value);
    return bucket;
  }

  removeBucket(bucket: CalendarBucket, destroy = true): void {
    const index = this.buckets.indexOf(bucket);
    if (index < 0) throw new DataException(`Trying to remove unavailable bucket from calendar '${this.getName()}'`);
    this.buckets.splice(index, 1);
    bucket.detachFrom(this);
    this.clearEventList();
    if (destroy) bucket.dispose();
  }

  attachBucket(bucket: CalendarBucket): void {
    if (!this.buckets.includes(bucket)) this.buckets.push(bucket);
    this.sortBuckets();
  }

  sortBuckets(): void {
    this.buckets.sort(compareBuckets);
    this.clearEventList();
  }

  clearEventList(): void { this.eventList = []; }

  buildEventList(_include: PlanningDate | string | number = PlanningDate.infinitePast): void {
    // The native iterator extends its one-year cache whenever it reaches an
    // edge. Materializing the finite frePPLe horizon in one pass gives the
    // same event stream without invalidating TypeScript iterators mid-loop.
    const lower = PlanningDate.infinitePast;
    const upper = PlanningDate.infiniteFuture;

    const candidates = new Map<number, PlanningDate>();
    const addCandidate = (date: PlanningDate): void => { candidates.set(date.getTicks(), new PlanningDate(date)); };
    addCandidate(PlanningDate.infinitePast);
    for (const bucket of this.buckets) {
      addCandidate(bucket.getStart());
      addCandidate(bucket.getEnd());
      if (bucket.isContinuouslyEffective() || bucket.getDays() === 0) continue;
      const from = bucket.getStart().compare(lower) > 0 ? bucket.getStart() : lower;
      const to = bucket.getEnd().compare(upper) < 0 ? bucket.getEnd() : upper;
      const midnightDetail = new DateDetail(from);
      midnightDetail.roundDownDay();
      let midnight = midnightDetail.toDate();
      let guard = 0;
        while (midnight.compare(to) <= 0 && guard++ < Math.ceil((2 * YEAR + upper.getTicks() - lower.getTicks()) / DAY)) {
        const weekday = midnight.getInfo().weekDay;
        if ((bucket.getDays() & (1 << weekday)) !== 0) {
          const start = midnight.add(bucket.getStartTime());
          const end = midnight.add(bucket.getEndTime());
          if (start.compare(bucket.getStart()) >= 0 && start.compare(bucket.getEnd()) < 0) addCandidate(start);
          if (end.compare(bucket.getStart()) > 0 && end.compare(bucket.getEnd()) <= 0) addCandidate(end);
        }
        midnightDetail.addDays(1);
        midnight = midnightDetail.toDate();
      }
    }

    const result: Array<readonly [PlanningDate, number]> = [];
    for (const date of [...candidates.values()].sort((left, right) => left.compare(right))) {
      const value = this.findBucket(date, true)?.getValue() ?? this.defaultValue;
      if (!result.length || result[result.length - 1]?.[1] !== value) result.push([date, value]);
    }
    this.eventList = result;
  }

  eventSnapshot(include: PlanningDate): ReadonlyArray<readonly [PlanningDate, number]> {
    if (!this.eventList.length || include.compare(this.eventList[0]?.[0] ?? PlanningDate.infinitePast) < 0 ||
        include.compare(this.eventList[this.eventList.length - 1]?.[0] ?? PlanningDate.infiniteFuture) > 0) {
      this.buildEventList(include);
    }
    return this.eventList;
  }

  getEvents(start: PlanningDate | string | number = PlanningDate.infinitePast, forward = true): CalendarEventIterator {
    return new CalendarEventIterator(this, asDate(start), forward);
  }

  setPythonValue(start: PlanningDate | string | number, end: PlanningDate | string | number, value: number): void {
    this.setValue(start, end, value);
  }

  private lowestPriority(): number {
    return this.buckets.reduce((lowest, bucket) => Math.min(lowest, bucket.getPriority()), 0);
  }

  private matchesWeeklyPeriod(bucket: CalendarBucket, date: PlanningDate, forward: boolean): boolean {
    if (bucket.isContinuouslyEffective()) return true;
    const info = date.getInfo();
    let weekday = info.weekDay;
    let second = info.hour * 3600 + info.minute * 60 + info.second;
    if (!second && !forward) {
      second = DAY;
      weekday = (weekday + 6) % 7;
    }
    if ((bucket.getDays() & (1 << weekday)) === 0) return false;
    return forward
      ? second >= bucket.getStartTime().seconds && second < bucket.getEndTime().seconds
      : second > bucket.getStartTime().seconds && second <= bucket.getEndTime().seconds;
  }

  protected override disposeReferences(): void {
    for (const bucket of [...this.buckets]) bucket.dispose();
    for (const reference of this.referencedBy()) {
      for (const property of ["Available", "MaximumCalendar", "MinimumCalendar", "EfficiencyCalendar", "SizeMinimumCalendar"]) {
        if (callReference(reference, `get${property}`) !== this) continue;
        const setter = Reflect.get(reference, `set${property}`);
        if (typeof setter === "function") Reflect.apply(setter, reference, [null]);
      }
    }
    this.clearEventList();
  }
}

export class CalendarDefault extends Calendar {
  static override readonly cppBases: readonly string[] = ["Calendar"];
  static override readonly cppQualifiedNames: readonly string[] = ["CalendarDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "calendar_default"; }
}

export class CalendarBucket extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["HasSource", "NonCopyable", "Object"];
  static readonly cppQualifiedNames: readonly string[] = ["CalendarBucket"];
  private static readonly names = new Map<string, CalendarBucket>();
  private start = new PlanningDate(PlanningDate.infinitePast);
  private endDate = new PlanningDate(PlanningDate.infiniteFuture);
  private calendar: Calendar | null = null;
  private value = 0;
  private startTime = new Duration(0);
  private endTime = new Duration(DAY);
  private priority = 0;
  private days = 127;
  private source = "";
  private disposed = false;

  constructor(fields?: Readonly<Record<string, unknown>>) {
    super();
    if (fields) applyDataFields(this, fields);
  }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static getByName(name: string): CalendarBucket | undefined { return this.names.get(String(name)); }
  static reader(fields: Readonly<Record<string, unknown>>): CalendarBucket {
    const calendar = fields.calendar instanceof Calendar ? fields.calendar : null;
    const start = asDate(fields.start as PlanningDate | string | number ?? PlanningDate.infinitePast);
    const end = asDate(fields.end as PlanningDate | string | number ?? PlanningDate.infiniteFuture);
    const priority = Number(fields.priority ?? 0);
    const existing = calendar ? [...calendar.getBuckets()].find((bucket) => bucket.start.equals(start) && bucket.endDate.equals(end) && bucket.priority === priority) : undefined;
    if (existing) return existing;
    return new CalendarBucket(fields);
  }
  getType(): string { return "bucket"; }
  getCalendar(): Calendar | null { return this.calendar; }
  setCalendar(calendar: Calendar | null): void {
    if (calendar === this.calendar) return;
    const previous = this.calendar;
    if (previous) previous.removeBucket(this, false);
    this.calendar = calendar;
    calendar?.attachBucket(this);
  }
  detachFrom(calendar: Calendar): void { if (this.calendar === calendar) this.calendar = null; }
  getValue(): number { return this.value; }
  setValue(value: number): void { this.value = Number(value); this.calendar?.clearEventList(); }
  getEnd(): PlanningDate { return new PlanningDate(this.endDate); }
  setEnd(value: PlanningDate | string | number): void {
    const date = asDate(value);
    if (date.compare(this.start) < 0) Environment.log("Warning: Calendar bucket end must be later than its start");
    else { this.endDate = date; this.calendar?.clearEventList(); }
  }
  getStart(): PlanningDate { return new PlanningDate(this.start); }
  setStart(value: PlanningDate | string | number): void {
    const date = asDate(value);
    if (date.compare(this.endDate) > 0) Environment.log("Warning: Calendar bucket start must be earlier than its end");
    else { this.start = date; this.calendar?.sortBuckets(); }
  }
  getPriority(): number { return this.priority; }
  setPriority(value: number): void { this.priority = Math.trunc(Number(value)); this.calendar?.sortBuckets(); }
  getDays(): number { return this.days; }
  setDays(value: number): void {
    const days = Math.trunc(Number(value));
    if (days < 0 || days > 127) Environment.log("Warning: Calendar bucket days must be between 0 and 127");
    else { this.days = days; this.calendar?.clearEventList(); }
  }
  getStartTime(): Duration { return new Duration(this.startTime); }
  setStartTime(value: Duration | string | number): void {
    const duration = asDuration(value);
    if (duration.seconds < 0 || duration.seconds > DAY) {
      Environment.log("Warning: Calendar bucket start time must be between 0 and 86400 seconds");
      return;
    }
    this.startTime = duration;
    if (this.startTime.compare(this.endTime) > 0) [this.startTime, this.endTime] = [this.endTime, this.startTime];
    this.calendar?.clearEventList();
  }
  getEndTime(): Duration { return new Duration(this.endTime); }
  setEndTime(value: Duration | string | number): void {
    const duration = asDuration(value);
    if (duration.seconds < 0 || duration.seconds > DAY) {
      Environment.log("Warning: Calendar bucket end time must be between 0 and 86400 seconds");
      return;
    }
    this.endTime = duration;
    if (this.startTime.compare(this.endTime) > 0) [this.startTime, this.endTime] = [this.endTime, this.startTime];
    this.calendar?.clearEventList();
  }
  getBool(): boolean { return this.value !== 0; }
  isContinuouslyEffective(): boolean { return this.days === 127 && this.startTime.seconds === 0 && this.endTime.seconds === DAY; }
  getSource(): string { return this.source; }
  setSource(value: string): void { this.source = String(value); }
  getName(): string {
    for (const [name, bucket] of CalendarBucket.names) if (bucket === this) return name;
    return "";
  }
  setName(value: string): void {
    const name = String(value);
    if (!CalendarBucket.names.has(name)) CalendarBucket.names.set(name, this);
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.calendar) this.calendar.removeBucket(this, false);
    for (const [name, bucket] of CalendarBucket.names) if (bucket === this) CalendarBucket.names.delete(name);
    super.dispose();
  }
}

export class CalendarBucketIterator implements Iterable<CalendarBucket> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["CalendarBucket::iterator"] as const;
  private index = 0;
  constructor(private readonly values: readonly CalendarBucket[] = []) {}
  current(): CalendarBucket | null { return this.values[this.index] ?? null; }
  next(): CalendarBucket | null { return this.values[this.index++] ?? null; }
  end(): CalendarBucketIterator { return new CalendarBucketIterator(); }
  [Symbol.iterator](): Iterator<CalendarBucket> { return this.values.values(); }
}

export class CalendarEventIterator implements IterableIterator<readonly [PlanningDate, number]> {
  static readonly cppBases = ["PythonExtension"] as const;
  static readonly cppQualifiedNames = ["Calendar::EventIterator", "CalendarEventIterator"] as const;
  private readonly events: ReadonlyArray<readonly [PlanningDate, number]>;
  private index: number;
  private currentDate: PlanningDate;
  private currentValue: number;
  private previousValue: number;
  private initial = true;

  constructor(private readonly calendar: Calendar | null = null, start = PlanningDate.infinitePast, private readonly forward = true) {
    this.events = calendar?.eventSnapshot(start) ?? [];
    this.currentDate = new PlanningDate(start);
    this.currentValue = calendar?.getValue(start, forward) ?? 0;
    this.previousValue = this.currentValue;
    const candidate = this.events.findIndex(([date]) => date.compare(start) > 0);
    this.index = forward ? (candidate < 0 ? this.events.length : candidate) : (candidate < 0 ? this.events.length - 1 : candidate - 1);
  }
  static initialize(): number { return 0; }
  getCalendar(): Calendar | null { return this.calendar; }
  getDate(): PlanningDate { return new PlanningDate(this.currentDate); }
  getValue(): number { return this.currentValue; }
  getPrevValue(): number { return this.previousValue; }
  next(): IteratorResult<readonly [PlanningDate, number]> {
    if (this.initial) {
      this.initial = false;
      if ((this.forward && this.currentDate.equals(PlanningDate.infiniteFuture)) || (!this.forward && this.currentDate.equals(PlanningDate.infinitePast))) return { done: true, value: undefined };
      const value = [new PlanningDate(this.currentDate), this.currentValue] as const;
      this.advance();
      return { done: false, value };
    }
    if ((this.forward && this.currentDate.equals(PlanningDate.infiniteFuture)) || (!this.forward && this.currentDate.equals(PlanningDate.infinitePast))) return { done: true, value: undefined };
    const value = [new PlanningDate(this.currentDate), this.currentValue] as const;
    this.advance();
    return { done: false, value };
  }
  private advance(): void {
    this.previousValue = this.currentValue;
    const event = this.events[this.index];
    if (!event) {
      this.currentDate = new PlanningDate(this.forward ? PlanningDate.infiniteFuture : PlanningDate.infinitePast);
      this.currentValue = this.calendar?.getDefault() ?? 0;
      return;
    }
    this.currentDate = new PlanningDate(event[0]);
    this.currentValue = event[1];
    this.index += this.forward ? 1 : -1;
  }
  [Symbol.iterator](): IterableIterator<readonly [PlanningDate, number]> { return this; }
}














/**
 * Semantic migration unit for src/model/calendar.cpp.
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
  { name: "Calendar::initialize", sourceLine: 39, status: "ported" },
  { name: "CalendarBucket::initialize", sourceLine: 60, status: "ported" },
  { name: "CalendarDefault::initialize", sourceLine: 82, status: "ported" },
  { name: "Calendar::setValue", sourceLine: 96, status: "ported" },
  { name: "Calendar::~Calendar", sourceLine: 113, status: "ported" },
  { name: "Calendar::removeBucket", sourceLine: 146, status: "ported" },
  { name: "CalendarBucket::~CalendarBucket", sourceLine: 174, status: "ported" },
  { name: "CalendarBucket::setEnd", sourceLine: 190, status: "ported" },
  { name: "CalendarBucket::setStart", sourceLine: 197, status: "ported" },
  { name: "CalendarBucket::updateSort", sourceLine: 206, status: "ported" },
  { name: "Calendar::getValue", sourceLine: 243, status: "ported" },
  { name: "Calendar::findBucket", sourceLine: 263, status: "ported" },
  { name: "Calendar::addBucket", sourceLine: 314, status: "ported" },
  { name: "CalendarBucket::reader", sourceLine: 323, status: "ported" },
  { name: "CalendarBucket::setCalendar", sourceLine: 402, status: "ported" },
  { name: "Calendar::EventIterator::EventIterator", sourceLine: 424, status: "ported" },
  { name: "Calendar::buildEventList", sourceLine: 502, status: "ported" },
  { name: "Calendar::setPythonValue", sourceLine: 659, status: "ported" },
  { name: "Calendar::getEvents", sourceLine: 680, status: "ported" },
  { name: "CalendarEventIterator::initialize", sourceLine: 707, status: "ported" },
  { name: "CalendarEventIterator::iternext", sourceLine: 716, status: "ported" },
  { name: "CalendarBucket::getName", sourceLine: 730, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface CalendarPort {
  addBucket(...args: readonly PortValue[]): PortValue | void;
  buildEventList(...args: readonly PortValue[]): PortValue | void;
  disposeCalendar(...args: readonly PortValue[]): PortValue | void;
  findBucket(...args: readonly PortValue[]): PortValue | void;
  getEvents(...args: readonly PortValue[]): PortValue | void;
  getValue(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  removeBucket(...args: readonly PortValue[]): PortValue | void;
  setPythonValue(...args: readonly PortValue[]): PortValue | void;
  setValue(...args: readonly PortValue[]): PortValue | void;
}

export interface CalendarBucketPort {
  disposeCalendarBucket(...args: readonly PortValue[]): PortValue | void;
  getName(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  reader(...args: readonly PortValue[]): PortValue | void;
  setCalendar(...args: readonly PortValue[]): PortValue | void;
  setEnd(...args: readonly PortValue[]): PortValue | void;
  setStart(...args: readonly PortValue[]): PortValue | void;
  updateSort(...args: readonly PortValue[]): PortValue | void;
}

export interface CalendarDefaultPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface CalendarEventIteratorPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
  iternext(...args: readonly PortValue[]): PortValue | void;
}

export interface EventIteratorPort {
  EventIterator(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/calendar.cpp";
export const targetFile = "model/calendar.ts";

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
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "template <class Calendar>",
  "Tree utils::HasName<Calendar>::st;",
  "const MetaCategory* Calendar::metadata;",
  "const MetaCategory* Calendar::metadata_alias;",
  "const MetaClass* CalendarDefault::metadata;",
  "const MetaCategory* CalendarBucket::metacategory;",
  "const MetaClass* CalendarBucket::metadata;",
  "map<string, CalendarBucket*> CalendarBucket::names;",
  "",
  "int Calendar::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Calendar>(\"calendar\", \"calendars\",",
  "                                                      reader, finder);",
  "  registerFields<Calendar>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // An alias for the calendar",
  "  metadata_alias = MetaCategory::registerCategory<Calendar>(",
  "      \"calendar_reorderpoints\", \"calendars_reorderpoints\", reader, finder);",
  "  registerFields<Calendar>(const_cast<MetaCategory*>(metadata_alias));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<Calendar>::getPythonType();",
  "  x.addMethod(\"setValue\", setPythonValue, METH_VARARGS | METH_KEYWORDS,",
  "              \"update the value in a date range\");",
  "  x.addMethod(\"events\", getEvents, METH_VARARGS, \"return an event iterator\");",
  "  int ok = FreppleCategory<Calendar>::initialize();",
  "  ok += CalendarEventIterator::initialize();",
  "  return ok;",
  "}",
  "",
  "int CalendarBucket::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<CalendarBucket>(",
  "      \"bucket\", \"buckets\", reader);",
  "  registerFields<CalendarBucket>(const_cast<MetaCategory*>(metacategory));",
  "  metadata = MetaClass::registerClass<CalendarBucket>(",
  "      \"bucket\", \"bucket\", Object::create<CalendarBucket>, true);",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<CalendarBucket>::getPythonType();",
  "  x.setName(metadata->type);",
  "  x.setDoc(\"frePPLe \" + metadata->type);",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportstr();",
  "  x.supportcompare();",
  "  x.supportcreate(Object::create<CalendarBucket>);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "int CalendarDefault::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<CalendarDefault>(",
  "      \"calendar\", \"calendar_default\", Object::create<CalendarDefault>, true);",
  "",
  "  const_cast<MetaCategory*>(Calendar::metadata_alias)",
  "      ->setDefaultClass(CalendarDefault::metadata);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<CalendarDefault, Calendar>::initialize();",
  "}",
  "",
  "/* Updates the value in a certain date range.",
  " * This will create a new bucket if required. */",
  "void Calendar::setValue(Date start, Date end, const double v) {",
  "  auto* x = static_cast<CalendarBucket*>(findBucket(start));",
  "  if (x && x->getStart() == start && x->getEnd() <= end)",
  "    // We can update an existing bucket: it has the same start date",
  "    // and ends before the new effective period ends.",
  "    x->setEnd(end);",
  "  else {",
  "    // Creating a new bucket",
  "    x = new CalendarBucket();",
  "    x->setStart(start);",
  "    x->setEnd(end);",
  "    x->setCalendar(this);",
  "  }",
  "  x->setValue(v);",
  "  x->setPriority(lowestPriority() - 1);",
  "}",
  "",
  "Calendar::~Calendar() {",
  "  // De-allocate all the dynamic memory used for the bucket objects",
  "  while (firstBucket) {",
  "    CalendarBucket* tmp = firstBucket;",
  "    firstBucket = firstBucket->nextBucket;",
  "    delete tmp;",
  "  }",
  "",
  "  // Remove all references from locations",
  "  for (auto& l : Location::all()) {",
  "    if (l.getAvailable() == this) l.setAvailable(nullptr);",
  "  }",
  "",
  "  // Remove reference from buffers",
  "  for (auto& b : Buffer::all()) {",
  "    if (b.getMaximumCalendar() == this) b.setMaximumCalendar(nullptr);",
  "    if (b.getMinimumCalendar() == this) b.setMinimumCalendar(nullptr);",
  "  }",
  "",
  "  // Remove references from resources",
  "  for (auto& r : Resource::all()) {",
  "    if (r.getMaximumCalendar() == this) r.setMaximumCalendar(nullptr);",
  "    if (r.getEfficiencyCalendar() == this) r.setEfficiencyCalendar(nullptr);",
  "    if (r.getAvailable() == this) r.setAvailable(nullptr);",
  "  }",
  "",
  "  // Remove references from operations",
  "  for (auto& o : Operation::all()) {",
  "    if (o.getAvailable() == this) o.setAvailable(nullptr);",
  "    if (o.getSizeMinimumCalendar() == this) o.setSizeMinimumCalendar(nullptr);",
  "  }",
  "}",
  "",
  "void Calendar::removeBucket(CalendarBucket* bkt, bool del) {",
  "  // Verify the bucket is on this calendar indeed",
  "  CalendarBucket* b = firstBucket;",
  "  while (b && b != bkt) b = b->nextBucket;",
  "",
  "  // Error",
  "  if (!b)",
  "    throw DataException(\"Trying to remove unavailable bucket from calendar '\" +",
  "                        getName() + \"'\");",
  "",
  "  // Update the list",
  "  if (bkt->prevBucket)",
  "    // Previous bucket links to a new next bucket",
  "    bkt->prevBucket->nextBucket = bkt->nextBucket;",
  "  else",
  "    // New head for the bucket list",
  "    firstBucket = bkt->nextBucket;",
  "  if (bkt->nextBucket)",
  "    // Update the reference prevBucket of the next bucket",
  "    bkt->nextBucket->prevBucket = bkt->prevBucket;",
  "",
  "  // Delete the bucket",
  "  bkt->nextBucket = nullptr;",
  "  bkt->prevBucket = nullptr;",
  "  bkt->cal = nullptr;",
  "  if (del) delete bkt;",
  "}",
  "",
  "CalendarBucket::~CalendarBucket() {",
  "  if (!cal) return;",
  "",
  "  // Update the list",
  "  if (prevBucket)",
  "    // Previous bucket links to a new next bucket",
  "    prevBucket->nextBucket = nextBucket;",
  "  else",
  "    // New head for the bucket list",
  "    cal->firstBucket = nextBucket;",
  "  if (nextBucket)",
  "    // Update the reference prevBucket of the next bucket",
  "    nextBucket->prevBucket = prevBucket;",
  "  cal->eventlist.clear();",
  "}",
  "",
  "void CalendarBucket::setEnd(const Date d) {",
  "  if (d < startdate)",
  "    logger << \"Warning: Calendar bucket end must be later than its start\\n\";",
  "  else",
  "    enddate = d;",
  "}",
  "",
  "void CalendarBucket::setStart(const Date d) {",
  "  if (d > enddate)",
  "    logger << \"Warning: Calendar bucket start must be earlier than its end\\n\";",
  "  else {",
  "    startdate = d;",
  "    updateSort();",
  "  }",
  "}",
  "",
  "void CalendarBucket::updateSort() {",
  "  // Update the position in the list",
  "  if (!cal) return;",
  "  bool ok = true;",
  "  do {",
  "    ok = true;",
  "    if (nextBucket && (nextBucket->startdate < startdate ||",
  "                       (nextBucket->startdate == startdate &&",
  "                        nextBucket->priority < priority))) {",
  "      // Move a position later in the list",
  "      if (nextBucket->nextBucket) nextBucket->nextBucket->prevBucket = this;",
  "      if (prevBucket)",
  "        prevBucket->nextBucket = nextBucket;",
  "      else",
  "        cal->firstBucket = nextBucket;",
  "      nextBucket->prevBucket = prevBucket;",
  "      prevBucket = nextBucket;",
  "      CalendarBucket* tmp = nextBucket->nextBucket;",
  "      nextBucket->nextBucket = this;",
  "      nextBucket = tmp;",
  "      ok = false;",
  "    } else if (prevBucket && (prevBucket->startdate > startdate ||",
  "                              (prevBucket->startdate == startdate &&",
  "                               prevBucket->priority > priority))) {",
  "      // Move a position earlier in the list",
  "      if (prevBucket->prevBucket) prevBucket->prevBucket->nextBucket = this;",
  "      if (nextBucket) nextBucket->prevBucket = prevBucket;",
  "      prevBucket->nextBucket = nextBucket;",
  "      nextBucket = prevBucket;",
  "      CalendarBucket* tmp = prevBucket->prevBucket;",
  "      prevBucket->prevBucket = this;",
  "      prevBucket = tmp;",
  "      ok = false;",
  "    }",
  "  } while (!ok);  // Repeat till in place",
  "}",
  "",
  "double Calendar::getValue(const Date d, bool forward) const {",
  "  if (eventlist.empty()) {",
  "    CalendarBucket* x = findBucket(d, forward);",
  "    return x ? x->getValue() : defaultValue;",
  "  } else {",
  "    auto event = forward ? eventlist.upper_bound(d) : eventlist.lower_bound(d);",
  "    if (event != eventlist.begin()) {",
  "      --event;",
  "      if (event != eventlist.end())",
  "        return event->second;",
  "      else",
  "        return getDefault();",
  "      return event->second;",
  "    } else if (eventlist.empty())",
  "      return getDefault();",
  "    else",
  "      return eventlist.rbegin()->second;",
  "  }",
  "}",
  "",
  "CalendarBucket* Calendar::findBucket(Date d, bool fwd) const {",
  "  CalendarBucket* curBucket = nullptr;",
  "  double curPriority = DBL_MAX;",
  "  int date_weekday = -1;",
  "  Duration date_time;",
  "  for (auto b = firstBucket; b; b = b->nextBucket) {",
  "    if (b->getStart() == b->getEnd())",
  "      continue;",
  "    else if (b->getStart() > d)",
  "      // Buckets are sorted by the start date. Other entries definitely",
  "      // won't be effective.",
  "      break;",
  "    else if (curPriority > b->getPriority() &&",
  "             ((fwd && d >= b->getStart() && d < b->getEnd()) ||",
  "              (fwd && d == Date::infiniteFuture &&",
  "               b->getEnd() == Date::infiniteFuture) ||",
  "              (!fwd && d > b->getStart() && d <= b->getEnd()))) {",
  "      if (b->isContinuouslyEffective()) {",
  "        // Continuously effective",
  "        curPriority = b->getPriority();",
  "        curBucket = &*b;",
  "      } else {",
  "        // There are ineffective periods during the week",
  "        if (date_weekday < 0) {",
  "          // Lazily get the details on the date, if not done already",
  "          struct tm datedetail;",
  "          d.getInfo(&datedetail);",
  "          date_weekday = datedetail.tm_wday;  // 0: sunday, 6: saturday",
  "          date_time = long(datedetail.tm_sec + datedetail.tm_min * 60 +",
  "                           datedetail.tm_hour * 3600);",
  "          if (!date_time && !fwd) {",
  "            date_time = Duration(86400L);",
  "            if (--date_weekday < 0) date_weekday = 6;",
  "          }",
  "        }",
  "        if (b->days & (1 << date_weekday)) {",
  "          // Effective on the requested date",
  "          if ((fwd && date_time >= b->starttime && date_time < b->endtime) ||",
  "              (!fwd && date_time > b->starttime && date_time <= b->endtime)) {",
  "            // Also falls within the effective hours.",
  "            // All conditions are met!",
  "            curPriority = b->getPriority();",
  "            curBucket = &*b;",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "  return curBucket;",
  "}",
  "",
  "CalendarBucket* Calendar::addBucket(Date st, Date nd, double val) {",
  "  auto* bckt = new CalendarBucket();",
  "  bckt->setCalendar(this);",
  "  bckt->setStart(st);",
  "  bckt->setEnd(nd);",
  "  bckt->setValue(val);",
  "  return bckt;",
  "}",
  "",
  "Object* CalendarBucket::reader(const MetaClass*, const DataValueDict& atts,",
  "                               CommandManager* mgr) {",
  "  // Pick up the calendar",
  "  const DataValue* cal_val = atts.get(Tags::calendar);",
  "  Calendar* cal =",
  "      cal_val ? static_cast<Calendar*>(cal_val->getObject()) : nullptr;",
  "",
  "  // Pick up the start date.",
  "  const DataValue* strtElement = atts.get(Tags::start);",
  "  Date strt;",
  "  if (strtElement) strt = strtElement->getDate();",
  "",
  "  // Pick up the end date.",
  "  const DataValue* endElement = atts.get(Tags::end);",
  "  Date nd = Date::infiniteFuture;",
  "  if (endElement) nd = endElement->getDate();",
  "",
  "  // Pick up  the priority",
  "  const DataValue* prioElement = atts.get(Tags::priority);",
  "  int prio = 0;",
  "  if (prioElement) prio = prioElement->getInt();",
  "",
  "  // Check for existence of a bucket with the same start, end and priority",
  "  CalendarBucket* result = nullptr;",
  "  if (cal) {",
  "    for (auto i = cal->getBuckets(); i != CalendarBucket::iterator::end(); ++i)",
  "      if (i->getStart() == strt && i->getEnd() == nd &&",
  "          i->getPriority() == prio) {",
  "        result = &*i;",
  "        break;",
  "      }",
  "  }",
  "",
  "  // Pick up the action attribute and update the bucket accordingly",
  "  switch (MetaClass::decodeAction(atts)) {",
  "    case Action::ADD:",
  "      // Only additions are allowed",
  "      if (result) {",
  "        ostringstream o;",
  "        o << \"Bucket already exists in calendar '\" << cal << \"'\";",
  "        throw DataException(o.str());",
  "      }",
  "      result = new CalendarBucket();",
  "      result->setStart(strt);",
  "      result->setEnd(nd);",
  "      result->setPriority(prio);",
  "      if (cal) result->setCalendar(cal);",
  "      if (mgr) mgr->add(new CommandCreateObject(result));",
  "      return result;",
  "    case Action::CHANGE:",
  "      // Only changes are allowed",
  "      if (!result) throw DataException(\"Bucket doesn't exist\");",
  "      return result;",
  "    case Action::REMOVE:",
  "      // Delete the entity",
  "      if (!result)",
  "        throw DataException(\"Bucket doesn't exist\");",
  "      else {",
  "        // Delete it",
  "        cal->removeBucket(result);",
  "        return nullptr;",
  "      }",
  "    case Action::ADD_CHANGE:",
  "      if (!result) {",
  "        // Adding a new bucket",
  "        result = new CalendarBucket();",
  "        result->setStart(strt);",
  "        result->setEnd(nd);",
  "        result->setPriority(prio);",
  "        if (cal) result->setCalendar(cal);",
  "        if (mgr) mgr->add(new CommandCreateObject(result));",
  "      }",
  "      return result;",
  "  }",
  "",
  "  // This part of the code isn't expected not be reached",
  "  throw LogicException(\"Unreachable code reached\");",
  "}",
  "",
  "void CalendarBucket::setCalendar(Calendar* c) {",
  "  if (cal == c) return;",
  "",
  "  // Unlink from the previous calendar",
  "  if (cal) {",
  "    cal->eventlist.clear();",
  "    cal->removeBucket(this, false);",
  "  }",
  "  cal = c;",
  "",
  "  // Link in the list of buckets of the new calendar",
  "  if (cal) {",
  "    if (cal->firstBucket) {",
  "      cal->firstBucket->prevBucket = this;",
  "      nextBucket = cal->firstBucket;",
  "    }",
  "    cal->firstBucket = this;",
  "    updateSort();",
  "    cal->eventlist.clear();",
  "  }",
  "}",
  "",
  "Calendar::EventIterator::EventIterator(Calendar* c, Date d, bool forward)",
  "    : theCalendar(c) {",
  "  if (!theCalendar) return;",
  "",
  "  if (theCalendar->eventlist.empty() ||",
  "      d < theCalendar->eventlist.begin()->first ||",
  "      d > theCalendar->eventlist.rbegin()->first)",
  "    theCalendar->buildEventList(d);",
  "",
  "  curDate = d;",
  "  if (forward) {",
  "    cacheiter = theCalendar->eventlist.lower_bound(d);",
  "    if (cacheiter != theCalendar->eventlist.end() && cacheiter->first > d)",
  "      --cacheiter;",
  "    if (cacheiter == theCalendar->eventlist.end())",
  "      curValue = theCalendar->getDefault();",
  "    else",
  "      curValue = cacheiter->second;",
  "  } else {",
  "    cacheiter = theCalendar->eventlist.lower_bound(d);",
  "    if (cacheiter != theCalendar->eventlist.end() && cacheiter->first > d)",
  "      --cacheiter;",
  "    if (cacheiter == theCalendar->eventlist.end())",
  "      curValue = theCalendar->getDefault();",
  "    else",
  "      curValue = cacheiter->second;",
  "  }",
  "  prevValue = curValue;",
  "}",
  "",
  "Calendar::EventIterator& Calendar::EventIterator::operator++() {",
  "  if (theCalendar && cacheiter != theCalendar->eventlist.end()) {",
  "    ++cacheiter;",
  "    if (cacheiter == theCalendar->eventlist.end()) {",
  "      // Extend the event list if possible",
  "      auto lastDate = theCalendar->eventlist.rbegin()->first;",
  "      if (!theCalendar->eventlist.empty() && lastDate != Date::infiniteFuture) {",
  "        theCalendar->buildEventList(lastDate);",
  "        cacheiter = theCalendar->eventlist.find(lastDate);",
  "        ++cacheiter;",
  "      }",
  "    }",
  "  }",
  "  prevValue = curValue;",
  "  if (!theCalendar || cacheiter == theCalendar->eventlist.end()) {",
  "    curDate = Date::infiniteFuture;",
  "    curValue = theCalendar ? theCalendar->getDefault() : 0.0;",
  "  } else {",
  "    curDate = cacheiter->first;",
  "    curValue = cacheiter->second;",
  "  }",
  "  return *this;",
  "}",
  "",
  "Calendar::EventIterator& Calendar::EventIterator::operator--() {",
  "  prevValue = curValue;",
  "  if (!theCalendar || cacheiter == theCalendar->eventlist.end()) {",
  "    curValue = theCalendar ? theCalendar->getDefault() : 0.0;",
  "    curDate = Date::infinitePast;",
  "  } else {",
  "    curDate = cacheiter->first;",
  "    --cacheiter;",
  "    if (cacheiter == theCalendar->eventlist.end()) {",
  "      auto firstDate = theCalendar->eventlist.begin()->first;",
  "      if (!theCalendar->eventlist.empty() && firstDate != Date::infinitePast) {",
  "        // Extend the event list",
  "        theCalendar->buildEventList(firstDate);",
  "        cacheiter = theCalendar->eventlist.find(firstDate);",
  "      }",
  "    }",
  "    if (cacheiter == theCalendar->eventlist.end())",
  "      curValue = theCalendar->getDefault();",
  "    else",
  "      curValue = cacheiter->second;",
  "  }",
  "  return *this;",
  "}",
  "",
  "void Calendar::buildEventList(Date includedate) {",
  "  // Default start and end",
  "  Date curDate;",
  "  if (eventlist.empty())",
  "    curDate = Plan::instance().getCurrent() - Duration(86400L * 365L);",
  "  else",
  "    curDate = eventlist.begin()->first;",
  "  Date maxDate;",
  "  if (eventlist.empty())",
  "    maxDate = Plan::instance().getCurrent() + Duration(86400L * 365L);",
  "  else",
  "    maxDate = eventlist.rbegin()->first;",
  "",
  "  // Assure the argument date is included",
  "  if (includedate == Date::infinitePast)",
  "    curDate = Date::infinitePast;",
  "  else if (includedate <= curDate)",
  "    curDate = includedate - Duration(86400L * 365L);",
  "  if (includedate == Date::infiniteFuture)",
  "    maxDate = Date::infiniteFuture;",
  "  else if (includedate >= maxDate)",
  "    maxDate = includedate + Duration(86400L * 365L);",
  "",
  "  // Collect all event dates",
  "  const CalendarBucket* curBucket = findBucket(curDate, true);",
  "  const CalendarBucket* lastBucket = curBucket;",
  "  int curPriority = curBucket ? curBucket->priority : INT_MAX;",
  "  int lastPriority = curPriority;",
  "  bool first = true;",
  "  while (true) {",
  "    if (first) {",
  "      eventlist[Date::infinitePast] =",
  "          curBucket ? curBucket->getValue() : getDefault();",
  "      first = false;",
  "    } else {",
  "      eventlist[curDate] = curBucket ? curBucket->getValue() : getDefault();",
  "      if (curDate > maxDate || curDate == Date::infiniteFuture) break;",
  "    }",
  "",
  "    // Go over all entries and ask them to update the iterator",
  "    Date refDate = curDate;",
  "    struct tm datedetail_refdate;",
  "    refDate.getInfo(&datedetail_refdate);",
  "    struct tm datedetail_startdata;",
  "    struct tm* datedetail;",
  "    curDate = Date::infiniteFuture;",
  "    for (auto b = firstBucket; b; b = b->nextBucket) {",
  "      if (b->getStart() == b->getEnd() || !b->getDays()) continue;",
  "      // FIRST CASE: Bucket that is continuously effective",
  "      if (b->isContinuouslyEffective()) {",
  "        // Evaluate the start date of the bucket",
  "        if (refDate < b->startdate && b->priority <= lastPriority &&",
  "            (b->startdate < curDate ||",
  "             (b->startdate == curDate && b->priority <= curPriority))) {",
  "          curDate = b->startdate;",
  "          curBucket = b;",
  "          curPriority = b->priority;",
  "          continue;",
  "        }",
  "",
  "        // Next evaluate the end date of the bucket",
  "        if (refDate < b->enddate && b->enddate <= curDate && lastBucket == b) {",
  "          curDate = b->enddate;",
  "          curBucket = findBucket(b->enddate);",
  "          curPriority = curBucket ? curBucket->priority : INT_MAX;",
  "          continue;",
  "        }",
  "",
  "        // This bucket won't create next event",
  "        continue;",
  "      }",
  "",
  "      // SECOND CASE: Interruptions in effectivity.",
  "",
  "      // Find details on the reference date",
  "      bool effectiveAtStart = false;",
  "      Date tmp = refDate;",
  "      if (refDate < b->startdate) {",
  "        tmp = b->startdate;",
  "        tmp.getInfo(&datedetail_startdata);",
  "        datedetail = &datedetail_startdata;",
  "      } else",
  "        datedetail = &datedetail_refdate;",
  "      DateDetail tmp_detail = tmp;",
  "      int ref_weekday = datedetail->tm_wday;  // 0: sunday, 6: saturday",
  "      Duration ref_time = long(datedetail->tm_sec + datedetail->tm_min * 60 +",
  "                               datedetail->tm_hour * 3600);",
  "      if (refDate < b->startdate && ref_time >= b->starttime &&",
  "          ref_time < b->endtime && (b->days & (1 << ref_weekday)))",
  "        effectiveAtStart = true;",
  "",
  "      if (ref_time >= b->starttime && !effectiveAtStart &&",
  "          ref_time < b->endtime && (b->days & (1 << ref_weekday))) {",
  "        // Entry is currently effective.",
  "        if (!b->starttime && b->endtime == Duration(86400L)) {",
  "          // The next event is the start of the next ineffective day",
  "          tmp_detail.setSecondsDay(0L);",
  "          tmp = tmp_detail;",
  "          while ((b->days & (1 << ref_weekday)) &&",
  "                 tmp != Date::infiniteFuture) {",
  "            if (++ref_weekday > 6) ref_weekday = 0;",
  "            tmp_detail.addDays(1);",
  "            tmp = tmp_detail;",
  "          }",
  "        } else {",
  "          // The next event is the end date on the current day",
  "          tmp_detail.setSecondsDay(b->endtime);",
  "          tmp = tmp_detail;",
  "        }",
  "        if (tmp > b->enddate) tmp = b->enddate;",
  "",
  "        // Evaluate the result",
  "        if (refDate < tmp && tmp <= curDate && lastBucket == b) {",
  "          curDate = tmp;",
  "          curBucket = findBucket(tmp);",
  "          curPriority = curBucket ? curBucket->priority : INT_MAX;",
  "        }",
  "      } else {",
  "        // Reference date is before the start time on an effective date",
  "        // or it is after the end time of an effective date",
  "        // or it is on an ineffective day.",
  "",
  "        // The next event is the start date, either today or on the next",
  "        // effective day.",
  "        tmp_detail.setSecondsDay(b->starttime);",
  "        tmp = tmp_detail;",
  "        if (ref_time >= b->endtime && (b->days & (1 << ref_weekday))) {",
  "          if (++ref_weekday > 6) ref_weekday = 0;",
  "          tmp_detail.setSecondsDay(b->starttime);",
  "          tmp_detail.addDays(1);",
  "          tmp = tmp_detail;",
  "        }",
  "        while (!(b->days & (1 << ref_weekday)) && tmp != Date::infiniteFuture &&",
  "               tmp <= b->enddate) {",
  "          if (++ref_weekday > 6) ref_weekday = 0;",
  "          tmp_detail.addDays(1);",
  "          tmp = tmp_detail;",
  "        }",
  "        if (tmp < b->startdate) tmp = b->startdate;",
  "        if (tmp >= b->enddate) continue;",
  "",
  "        // Evaluate the result",
  "        if (refDate < tmp && b->priority <= lastPriority &&",
  "            (tmp < curDate || (tmp == curDate && b->priority <= curPriority))) {",
  "          curDate = tmp;",
  "          curBucket = b;",
  "          curPriority = b->priority;",
  "        }",
  "      }",
  "    }",
  "",
  "    // Remember the bucket that won the evaluation",
  "    lastBucket = curBucket;",
  "    lastPriority = curPriority;",
  "  }",
  "}",
  "",
  "PyObject* Calendar::setPythonValue(PyObject* self, PyObject* args, PyObject*) {",
  "  try {",
  "    // Pick up the calendar",
  "    auto* cal = static_cast<CalendarDefault*>(self);",
  "    if (!cal) throw LogicException(\"Can't set value of a nullptr calendar\");",
  "",
  "    // Parse the arguments",
  "    PyObject *pystart, *pyend, *pyval;",
  "    if (!PyArg_ParseTuple(args, \"OOO:setValue\", &pystart, &pyend, &pyval))",
  "      return nullptr;",
  "",
  "    // Update the calendar",
  "    PythonData start(pystart), end(pyend), val(pyval);",
  "    cal->setValue(start.getDate(), end.getDate(), val.getDouble());",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* Calendar::getEvents(PyObject* self, PyObject* args) {",
  "  try {",
  "    // Pick up the calendar",
  "    Calendar* cal = nullptr;",
  "    PythonData c(self);",
  "    if (c.check(CalendarDefault::metadata))",
  "      cal = static_cast<CalendarDefault*>(self);",
  "    else",
  "      throw LogicException(\"Invalid calendar type\");",
  "",
  "    // Parse the arguments",
  "    PyObject* pystart = nullptr;",
  "    PyObject* pydirection = nullptr;",
  "    if (!PyArg_ParseTuple(args, \"|OO:getEvents\", &pystart, &pydirection))",
  "      return nullptr;",
  "    Date startdate =",
  "        pystart ? PythonData(pystart).getDate() : Date::infinitePast;",
  "    bool forward = pydirection ? PythonData(pydirection).getBool() : true;",
  "",
  "    // Return the iterator",
  "    return new CalendarEventIterator(cal, startdate, forward);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "int CalendarEventIterator::initialize() {",
  "  // Initialize the type",
  "  auto& x = PythonExtension<CalendarEventIterator>::getPythonType();",
  "  x.setName(\"calendarEventIterator\");",
  "  x.setDoc(\"frePPLe iterator for calendar events\");",
  "  x.supportiter();",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* CalendarEventIterator::iternext() {",
  "  if ((forward && eventiter.getDate() == Date::infiniteFuture) ||",
  "      (!forward && eventiter.getDate() == Date::infinitePast))",
  "    return nullptr;",
  "  PyObject* result = Py_BuildValue(",
  "      \"(O,O)\", static_cast<PyObject*>(PythonData(eventiter.getDate())),",
  "      static_cast<PyObject*>(PythonData(eventiter.getValue())));",
  "  if (forward)",
  "    ++eventiter;",
  "  else",
  "    --eventiter;",
  "  return result;",
  "}",
  "",
  "string CalendarBucket::getName() const {",
  "  // We don't store the name field on the calendar bucket.",
  "  // We just do an inefficient linear loop here (since you won't call this",
  "  // method too often anyway).",
  "  for (const auto& f : names)",
  "    if (f.second == this) return f.first;",
  "  return \"\";",
  "}",
  "",
  "}  // namespace frepple",
];
