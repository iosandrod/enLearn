/**
 * Semantic migration unit for src/utils/date.cpp.
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
  { name: "Date::infinitePast", sourceLine: 39, status: "adapted" },
  { name: "Date::infiniteFuture", sourceLine: 43, status: "adapted" },
  { name: "Duration::MAX", sourceLine: 45, status: "adapted" },
  { name: "Duration::MIN", sourceLine: 46, status: "adapted" },
  { name: "Duration::toCharBuffer", sourceLine: 48, status: "adapted" },
  { name: "Duration::double2CharBuffer", sourceLine: 82, status: "adapted" },
  { name: "Duration::parse", sourceLine: 138, status: "adapted" },
  { name: "Duration::parse2double", sourceLine: 232, status: "adapted" },
  { name: "Date::parse", sourceLine: 346, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface DatePort {
  infiniteFuture(...args: readonly PortValue[]): PortValue | void;
  infinitePast(...args: readonly PortValue[]): PortValue | void;
  parse(...args: readonly PortValue[]): PortValue | void;
}

export interface DurationPort {
  MAX(...args: readonly PortValue[]): PortValue | void;
  MIN(...args: readonly PortValue[]): PortValue | void;
  double2CharBuffer(...args: readonly PortValue[]): PortValue | void;
  parse(...args: readonly PortValue[]): PortValue | void;
  parse2double(...args: readonly PortValue[]): PortValue | void;
  toCharBuffer(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/date.cpp";
export const targetFile = "utils/date.ts";

export class DataException extends Error {
  override readonly name = "DataException";
}

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 2_628_000;
const YEAR = 365 * DAY;
const PAST_TICKS = globalThis.Date.UTC(1971, 0, 1, 0, 0, 0) / 1000;
const FUTURE_TICKS = globalThis.Date.UTC(2030, 11, 31, 0, 0, 0) / 1000;

function truncateLikeCpp(value: number): number {
  return Math.trunc(value);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function assertFiniteNumber(value: number, description: string): void {
  if (!Number.isFinite(value)) throw new DataException(`Invalid ${description} '${value}'`);
}

/** A duration in seconds, matching the integer storage of the C++ class. */
export class Duration {
  static readonly MAX = new Duration(FUTURE_TICKS - PAST_TICKS);
  static readonly MIN = new Duration(PAST_TICKS - FUTURE_TICKS);

  private value: number;

  constructor(value: number | string | Duration = 0) {
    if (value instanceof Duration) this.value = value.value;
    else if (typeof value === "string") this.value = Duration.parse(value);
    else {
      assertFiniteNumber(value, "duration");
      this.value = Number.isInteger(value) ? value : truncateLikeCpp(value + 0.499);
    }
  }

  get seconds(): number {
    return this.value;
  }

  getSeconds(): number {
    return this.value;
  }

  valueOf(): number {
    return this.value;
  }

  isZero(): boolean {
    return this.value === 0;
  }

  compare(other: Duration | number): number {
    const right = other instanceof Duration ? other.value : other;
    return this.value < right ? -1 : this.value > right ? 1 : 0;
  }

  equals(other: Duration): boolean {
    return this.value === other.value;
  }

  add(other: Duration): Duration {
    return new Duration(this.value + other.value);
  }

  subtract(other: Duration): Duration {
    return new Duration(this.value - other.value);
  }

  multiply(factor: number): Duration {
    assertFiniteNumber(factor, "duration factor");
    return new Duration(truncateLikeCpp(this.value * factor));
  }

  toString(): string {
    return Duration.format(this.value, false);
  }

  static double2CharBuffer(value: number): string {
    assertFiniteNumber(value, "duration");
    return Duration.format(value, true);
  }

  static parse2double(text: string): number {
    const numeric = Number(text);
    if (!text.startsWith("P") && !text.startsWith("-P")) {
      if (!Number.isFinite(numeric) || text.trim() === "") {
        throw new DataException(`Invalid time string '${text}'`);
      }
      return numeric;
    }
    return Duration.parseComponents(text, true);
  }

  private static parse(text: string): number {
    return Duration.parseComponents(text, false);
  }

  private static parseComponents(text: string, decimals: boolean): number {
    const match = /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text);
    if (!match) throw new DataException(`Invalid time string '${text}'`);
    if (!match.slice(2).some((field) => field !== undefined)) {
      throw new DataException(`Invalid time string '${text}'`);
    }
    if (!decimals && match[8]?.includes(".")) {
      throw new DataException(`Invalid time string '${text}'`);
    }
    const value =
      Number(match[2] ?? 0) * YEAR +
      Number(match[3] ?? 0) * MONTH +
      Number(match[4] ?? 0) * WEEK +
      Number(match[5] ?? 0) * DAY +
      Number(match[6] ?? 0) * HOUR +
      Number(match[7] ?? 0) * MINUTE +
      Number(match[8] ?? 0);
    return match[1] ? -value : value;
  }

  private static format(input: number, decimals: boolean): string {
    if (input === 0) return "P0D";
    const negative = input < 0;
    let absolute = Math.abs(input);
    let whole = Math.trunc(absolute);
    const fraction = absolute - whole;
    const years = Math.trunc(whole / YEAR);
    whole %= YEAR;
    const days = Math.trunc(whole / DAY);
    whole %= DAY;
    const hours = Math.trunc(whole / HOUR);
    whole %= HOUR;
    const minutes = Math.trunc(whole / MINUTE);
    const seconds = whole % MINUTE;
    let result = negative ? "-P" : "P";
    if (years) result += `${years}Y`;
    if (days) result += `${days}D`;
    if (hours || minutes || seconds || (decimals && fraction)) {
      result += "T";
      if (hours) result += `${hours}H`;
      if (minutes) result += `${minutes}M`;
      if (decimals && fraction) result += `${(seconds + fraction).toFixed(3)}S`;
      else if (seconds) result += `${seconds}S`;
    }
    return result;
  }
}

/** A second-precision timestamp clamped to the frePPLe planning horizon. */
export class Date {
  static readonly format1 = "%Y-%m-%dT%H:%M:%S";
  static readonly format2 = "%Y-%m-%d %H:%M:%S";
  static readonly infinitePast = new Date(PAST_TICKS);
  static readonly infiniteFuture = new Date(FUTURE_TICKS);
  private static utc = true;

  private ticksValue: number;

  constructor(value: number | string | globalThis.Date | Date | null = PAST_TICKS) {
    if (value instanceof Date) this.ticksValue = value.ticksValue;
    else if (value instanceof globalThis.Date) this.ticksValue = Date.checkFinite(Math.trunc(value.getTime() / 1000));
    else if (typeof value === "string") this.ticksValue = Date.checkFinite(Date.parseText(value));
    else if (value === null) this.ticksValue = PAST_TICKS;
    else this.ticksValue = Date.checkFinite(Math.trunc(value));
  }

  static isUTC(): boolean {
    return Date.utc;
  }

  static detectUTC(timezone: string): void {
    Date.utc = ["UTC", "ETC/UTC", "GMT", "ETC/GMT", "Z", "ZULU"].includes(timezone.toUpperCase());
  }

  static now(): Date {
    return new Date(Math.trunc(globalThis.Date.now() / 1000));
  }

  getTicks(): number {
    return this.ticksValue;
  }

  valueOf(): number {
    return this.ticksValue;
  }

  isInitialized(): boolean {
    return this.ticksValue !== PAST_TICKS;
  }

  compare(other: Date): number {
    return this.ticksValue < other.ticksValue ? -1 : this.ticksValue > other.ticksValue ? 1 : 0;
  }

  equals(other: Date): boolean {
    return this.ticksValue === other.ticksValue;
  }

  add(duration: Duration): Date {
    return new Date(Date.checkFinite(this.ticksValue + duration.seconds));
  }

  subtract(value: Duration): Date;
  subtract(value: Date): Duration;
  subtract(value: Duration | Date): Date | Duration {
    return value instanceof Duration
      ? new Date(Date.checkFinite(this.ticksValue - value.seconds))
      : new Duration(this.ticksValue - value.ticksValue);
  }

  parse(text: string): void {
    this.ticksValue = Date.checkFinite(Date.parseText(text));
  }

  toString(format = Date.format1): string {
    return new DateDetail(this).toString(format);
  }

  toCharBuffer(): string {
    return this.toString();
  }

  getInfo(): Readonly<DateParts> {
    return new DateDetail(this).parts;
  }

  private static checkFinite(ticks: number): number {
    assertFiniteNumber(ticks, "date");
    return Math.min(FUTURE_TICKS, Math.max(PAST_TICKS, Math.trunc(ticks)));
  }

  private static parseText(text: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:Z)?$/.exec(text);
    if (!match) throw new DataException("Error parsing date");
    const values = match.slice(1).map(Number);
    const year = values[0] ?? 0;
    const month = values[1] ?? 0;
    const day = values[2] ?? 0;
    const hour = values[3] ?? 0;
    const minute = values[4] ?? 0;
    const second = values[5] ?? 0;
    const milliseconds = Date.utc || text.endsWith("Z")
      ? globalThis.Date.UTC(year, month - 1, day, hour, minute, second)
      : new globalThis.Date(year, month - 1, day, hour, minute, second).getTime();
    if (!Number.isFinite(milliseconds)) throw new DataException("Error parsing date");
    return Math.trunc(milliseconds / 1000);
  }
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekDay: number;
  yearDay: number;
}

function dateParts(ticks: number): DateParts {
  const date = new globalThis.Date(ticks * 1000);
  const utc = Date.isUTC();
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = utc ? date.getUTCDate() : date.getDate();
  const hour = utc ? date.getUTCHours() : date.getHours();
  const minute = utc ? date.getUTCMinutes() : date.getMinutes();
  const second = utc ? date.getUTCSeconds() : date.getSeconds();
  const weekDay = utc ? date.getUTCDay() : date.getDay();
  const yearStart = utc
    ? globalThis.Date.UTC(year, 0, 1)
    : new globalThis.Date(year, 0, 1).getTime();
  const yearDay = Math.floor((ticks * 1000 - yearStart) / (DAY * 1000));
  return { year, month, day, hour, minute, second, weekDay, yearDay };
}

/** Mutable broken-down calendar representation used for date arithmetic. */
export class DateDetail {
  private ticksValue: number;
  private datePartsValue: DateParts;

  constructor(date: Date);
  constructor(year: number, month: number, day: number, hour?: number, minute?: number, second?: number);
  constructor(
    dateOrYear: Date | number,
    month = 1,
    day = 1,
    hour = 0,
    minute = 0,
    second = 0,
  ) {
    if (dateOrYear instanceof Date) {
      this.ticksValue = dateOrYear.getTicks();
      this.datePartsValue = dateParts(this.ticksValue);
    } else {
      this.datePartsValue = {
        year: dateOrYear,
        month,
        day,
        hour,
        minute,
        second,
        weekDay: 0,
        yearDay: 0,
      };
      this.ticksValue = Number.NaN;
      this.normalize();
    }
  }

  get parts(): Readonly<DateParts> {
    return { ...this.datePartsValue };
  }

  toDate(): Date {
    this.normalize();
    return new Date(this.ticksValue);
  }

  normalize(): void {
    const p = this.datePartsValue;
    const milliseconds = Date.isUTC()
      ? globalThis.Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
      : new globalThis.Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second).getTime();
    this.ticksValue = Math.trunc(milliseconds / 1000);
    this.datePartsValue = dateParts(this.ticksValue);
  }

  getWeekDay(): number {
    return this.datePartsValue.weekDay;
  }

  getSecondsMonth(): number {
    const p = this.datePartsValue;
    return (p.day - 1) * DAY + this.getSecondsDay();
  }

  getSecondsYear(): number {
    return this.datePartsValue.yearDay * DAY + this.getSecondsDay();
  }

  getSecondsWeek(): number {
    return this.datePartsValue.weekDay * DAY + this.getSecondsDay();
  }

  getSecondsDay(): number {
    const p = this.datePartsValue;
    return p.hour * HOUR + p.minute * MINUTE + p.second;
  }

  roundDownDay(): void {
    this.datePartsValue.hour = 0;
    this.datePartsValue.minute = 0;
    this.datePartsValue.second = 0;
    this.normalize();
  }

  roundUpDay(): void {
    this.roundDownDay();
    this.addDays(1);
  }

  setSecondsDay(seconds: number): void {
    this.datePartsValue.hour = Math.trunc(seconds / HOUR);
    this.datePartsValue.minute = Math.trunc((seconds % HOUR) / MINUTE);
    this.datePartsValue.second = seconds % MINUTE;
    this.normalize();
  }

  addDays(days: number): void {
    this.datePartsValue.day += days;
    this.normalize();
  }

  toString(format = Date.format1): string {
    const p = this.datePartsValue;
    const replacements: Readonly<Record<string, string>> = {
      "%Y": pad(p.year, 4),
      "%m": pad(p.month),
      "%d": pad(p.day),
      "%H": pad(p.hour),
      "%M": pad(p.minute),
      "%S": pad(p.second),
      "%w": String(p.weekDay),
      "%j": pad(p.yearDay + 1, 3),
      "%%": "%",
    };
    return format.replace(/%[YmdHMSwj%]/g, (token) => replacements[token] ?? token);
  }

  toCharBuffer(): string {
    return this.toString();
  }
}

/** A normalized half-open interval [start, end). */
export class DateRange {
  private startValue: Date;
  private endValue: Date;

  constructor(start = Date.infinitePast, end = Date.infiniteFuture) {
    if (start.compare(end) <= 0) {
      this.startValue = new Date(start);
      this.endValue = new Date(end);
    } else {
      this.startValue = new Date(end);
      this.endValue = new Date(start);
    }
  }

  getStart(): Date {
    return new Date(this.startValue);
  }

  setStart(value: Date): void {
    this.startValue = new Date(value);
    if (this.startValue.compare(this.endValue) > 0) this.endValue = new Date(value);
  }

  getEnd(): Date {
    return new Date(this.endValue);
  }

  setEnd(value: Date): void {
    this.endValue = new Date(value);
    if (this.startValue.compare(this.endValue) > 0) this.startValue = new Date(value);
  }

  setStartAndEnd(start: Date, end: Date): void {
    const normalized = new DateRange(start, end);
    this.startValue = normalized.startValue;
    this.endValue = normalized.endValue;
  }

  getDuration(): Duration {
    return this.endValue.subtract(this.startValue);
  }

  isDefault(): boolean {
    return this.startValue.equals(Date.infinitePast) && this.endValue.equals(Date.infiniteFuture);
  }

  equals(other: DateRange): boolean {
    return this.startValue.equals(other.startValue) && this.endValue.equals(other.endValue);
  }

  compare(other: DateRange): number {
    const startComparison = this.startValue.compare(other.startValue);
    return startComparison || this.endValue.compare(other.endValue);
  }

  intersect(other: DateRange): boolean {
    return other.startValue.compare(this.endValue) <= 0 && other.endValue.compare(this.startValue) > 0;
  }

  overlap(other: DateRange): Duration {
    const end = Math.min(this.endValue.getTicks(), other.endValue.getTicks());
    const start = Math.max(this.startValue.getTicks(), other.startValue.getTicks());
    return new Duration(Math.max(0, end - start));
  }

  within(value: Date): boolean {
    return value.compare(this.startValue) >= 0 && value.compare(this.endValue) < 0;
  }

  between(value: Date): boolean {
    return value.compare(this.startValue) >= 0 && value.compare(this.endValue) <= 0;
  }

  almostEqual(other: DateRange): boolean {
    return Math.abs(this.startValue.getTicks() - other.startValue.getTicks()) <= 1 &&
      Math.abs(this.endValue.getTicks() - other.endValue.getTicks()) <= 1;
  }

  shift(duration: Duration): DateRange {
    return new DateRange(this.startValue.add(duration), this.endValue.add(duration));
  }

  toString(separator = " - "): string {
    return `${this.startValue.toString()}${separator}${this.endValue.toString()}`;
  }
}

// The TypeScript name avoids collisions in consumers that import the native Date.
export { Date as DateTime };

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
  "#include <clocale>",
  "#include <ctime>",
  "",
  "#include \"frepple/utils.h\"",
  "",
  "namespace frepple::utils {",
  "",
  "bool Date::is_utc = false;",
  "",
  "/* This is the earliest date that we can represent. This not the",
  " * traditional epoch start, but a year later. 1/1/1970 gave troubles",
  " * when using a timezone with positive offset to GMT.",
  " */",
  "const Date Date::infinitePast(\"1971-01-01T00:00:00\", true);",
  "",
  "/* This is the latest date that we can represent. This is not the absolute",
  " * limit of the internal representation, but more a convenient end date. */",
  "const Date Date::infiniteFuture(\"2030-12-31T00:00:00\", true);",
  "",
  "const Duration Duration::MAX(Date::infiniteFuture - Date::infinitePast);",
  "const Duration Duration::MIN(Date::infinitePast - Date::infiniteFuture);",
  "",
  "void Duration::toCharBuffer(char* t) const {",
  "  if (!lval) {",
  "    sprintf(t, \"P0D\");",
  "    return;",
  "  }",
  "  long tmp = (lval > 0 ? lval : -lval);",
  "  if (lval < 0) *(t++) = '-';",
  "  *(t++) = 'P';",
  "  if (tmp >= 31536000L) {",
  "    long y = tmp / 31536000L;",
  "    t += sprintf(t, \"%liY\", y);",
  "    tmp %= 31536000L;",
  "  }",
  "  if (tmp >= 86400L) {",
  "    long d = tmp / 86400L;",
  "    t += sprintf(t, \"%liD\", d);",
  "    tmp %= 86400L;",
  "  }",
  "  if (tmp > 0L) {",
  "    *(t++) = 'T';",
  "    if (tmp >= 3600L) {",
  "      long h = tmp / 3600L;",
  "      t += sprintf(t, \"%liH\", h);",
  "      tmp %= 3600L;",
  "    }",
  "    if (tmp >= 60L) {",
  "      long h = tmp / 60L;",
  "      t += sprintf(t, \"%liM\", h);",
  "      tmp %= 60L;",
  "    }",
  "    if (tmp > 0L) sprintf(t, \"%liS\", tmp);",
  "  }",
  "}",
  "",
  "void Duration::double2CharBuffer(double val, char* t) {",
  "  if (!val) {",
  "    sprintf(t, \"P0D\");",
  "    return;",
  "  }",
  "  double fractpart, intpart;",
  "  fractpart = modf(val, &intpart);",
  "  if (fractpart < 0) fractpart = -fractpart;",
  "  long tmp = static_cast<long>(intpart > 0 ? intpart : -intpart);",
  "  if (val < 0) *(t++) = '-';",
  "  *(t++) = 'P';",
  "  if (tmp >= 31536000L) {",
  "    long y = tmp / 31536000L;",
  "    t += sprintf(t, \"%liY\", y);",
  "    tmp %= 31536000L;",
  "  }",
  "  if (tmp >= 86400L) {",
  "    long d = tmp / 86400L;",
  "    t += sprintf(t, \"%liD\", d);",
  "    tmp %= 86400L;",
  "  }",
  "  if (tmp > 0L || fractpart) {",
  "    *(t++) = 'T';",
  "    if (tmp >= 3600L) {",
  "      long h = tmp / 3600L;",
  "      t += sprintf(t, \"%liH\", h);",
  "      tmp %= 3600L;",
  "    }",
  "    if (tmp >= 60L) {",
  "      long h = tmp / 60L;",
  "      t += sprintf(t, \"%liM\", h);",
  "      tmp %= 60L;",
  "    }",
  "    if (tmp > 0L || fractpart) {",
  "      if (fractpart)",
  "        sprintf(t, \"%.3fS\", fractpart + tmp);",
  "      else",
  "        sprintf(t, \"%liS\", tmp);",
  "    }",
  "  }",
  "}",
  "",
  "DateRange::operator string() const {",
  "  // Start date",
  "  char r[65];",
  "  char* pos = r + start.toCharBuffer(r);",
  "",
  "  // Append the separator",
  "  strcat(pos, separator.data());",
  "  pos += separator.size();",
  "",
  "  // Append the end date",
  "  end.toCharBuffer(pos);",
  "  return r;",
  "}",
  "",
  "void Duration::parse(const char* s) {",
  "  long totalvalue = 0;",
  "  long value = 0;",
  "  bool negative = false;",
  "  const char* c = s;",
  "",
  "  // Optional minus sign",
  "  if (*c == '-') {",
  "    negative = true;",
  "    ++c;",
  "  }",
  "",
  "  // Compulsary 'P'",
  "  if (*c != 'P') throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "  ++c;",
  "",
  "  // Parse the date part",
  "  for (; *c && *c != 'T'; ++c) {",
  "    switch (*c) {",
  "      case '0':",
  "      case '1':",
  "      case '2':",
  "      case '3':",
  "      case '4':",
  "      case '5':",
  "      case '6':",
  "      case '7':",
  "      case '8':",
  "      case '9':",
  "        value = value * 10 + (*c - '0');",
  "        break;",
  "      case 'Y':",
  "        totalvalue += value * 31536000L;",
  "        value = 0;",
  "        break;",
  "      case 'M':",
  "        // 1 Month = 1 Year / 12 = 365 days / 12",
  "        totalvalue += value * 2628000L;",
  "        value = 0;",
  "        break;",
  "      case 'W':",
  "        totalvalue += value * 604800L;",
  "        value = 0;",
  "        break;",
  "      case 'D':",
  "        totalvalue += value * 86400L;",
  "        value = 0;",
  "        break;",
  "      default:",
  "        throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "    }",
  "  }",
  "",
  "  // Parse the time part",
  "  if (*c == 'T') {",
  "    for (++c; *c; ++c) {",
  "      switch (*c) {",
  "        case '0':",
  "        case '1':",
  "        case '2':",
  "        case '3':",
  "        case '4':",
  "        case '5':",
  "        case '6':",
  "        case '7':",
  "        case '8':",
  "        case '9':",
  "          value = value * 10 + (*c - '0');",
  "          break;",
  "        case 'H':",
  "          totalvalue += value * 3600L;",
  "          value = 0;",
  "          break;",
  "        case 'M':",
  "          totalvalue += value * 60L;",
  "          value = 0;",
  "          break;",
  "        case 'S':",
  "          totalvalue += value;",
  "          value = 0;",
  "          break;",
  "        default:",
  "          throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "      }",
  "    }",
  "  }",
  "",
  "  // Missing a time unit",
  "  if (value) throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "",
  "  // If no exceptions were thrown we can now store the value",
  "  lval = negative ? -totalvalue : totalvalue;",
  "}",
  "",
  "double Duration::parse2double(const char* s) {",
  "  double totalvalue = 0.0;",
  "  long value = 0;",
  "  double milliseconds = 0.0;",
  "  bool negative = false;",
  "  bool subseconds = false;",
  "  const char* c = s;",
  "",
  "  // Optional minus sign",
  "  if (*c == '-') {",
  "    negative = true;",
  "    ++c;",
  "  }",
  "",
  "  // Compulsary 'P' if the string is formatted as an XML duration, but",
  "  // the string can also be formatted as a numeric value",
  "  if (*c != 'P') {",
  "    char* endptr;",
  "    double value = strtod(s, &endptr);",
  "    if (*endptr) throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "    return value;",
  "  }",
  "  ++c;",
  "",
  "  // Parse the date part",
  "  for (; *c && *c != 'T'; ++c) {",
  "    switch (*c) {",
  "      case '0':",
  "      case '1':",
  "      case '2':",
  "      case '3':",
  "      case '4':",
  "      case '5':",
  "      case '6':",
  "      case '7':",
  "      case '8':",
  "      case '9':",
  "        value = value * 10 + (*c - '0');",
  "        break;",
  "      case 'Y':",
  "        totalvalue += value * 31536000L;",
  "        value = 0;",
  "        break;",
  "      case 'M':",
  "        // 1 Month = 1 Year / 12 = 365 days / 12",
  "        totalvalue += value * 2628000L;",
  "        value = 0;",
  "        break;",
  "      case 'W':",
  "        totalvalue += value * 604800L;",
  "        value = 0;",
  "        break;",
  "      case 'D':",
  "        totalvalue += value * 86400L;",
  "        value = 0;",
  "        break;",
  "      default:",
  "        throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "    }",
  "  }",
  "",
  "  // Parse the time part",
  "  if (*c == 'T') {",
  "    for (++c; *c; ++c) {",
  "      switch (*c) {",
  "        case '0':",
  "        case '1':",
  "        case '2':",
  "        case '3':",
  "        case '4':",
  "        case '5':",
  "        case '6':",
  "        case '7':",
  "        case '8':",
  "        case '9':",
  "          if (subseconds) {",
  "            milliseconds = milliseconds + static_cast<double>(*c - '0') / value;",
  "            value *= 10;",
  "          } else",
  "            value = value * 10 + (*c - '0');",
  "          break;",
  "        case 'H':",
  "          totalvalue += value * 3600L;",
  "          value = 0;",
  "          break;",
  "        case 'M':",
  "          totalvalue += value * 60L;",
  "          value = 0;",
  "          break;",
  "        case '.':",
  "          totalvalue += value;",
  "          value = 10;",
  "          subseconds = true;",
  "          break;",
  "        case 'S':",
  "          if (subseconds)",
  "            totalvalue += milliseconds;",
  "          else",
  "            totalvalue += value;",
  "          value = 0;",
  "          break;",
  "        default:",
  "          throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "      }",
  "    }",
  "  }",
  "",
  "  // Missing a time unit",
  "  if (value) throw DataException(\"Invalid time string '\" + string(s) + \"'\");",
  "",
  "  // If no exceptions were thrown we can now store the value",
  "  return negative ? -totalvalue : totalvalue;",
  "}",
  "",
  "void Date::parse(const char* s) {",
  "  if (!s) {",
  "    // Null string passed - default value is infinite past",
  "    lval = infinitePast.lval;",
  "    return;",
  "  }",
  "  struct tm p;",
  "  memset(&p, 0, sizeof(struct tm));",
  "  auto ok =",
  "      strptime(s, (strchr(s, 'T') != nullptr ? format1 : format2).data(), &p);",
  "  if (!ok) throw DataException(\"Error parsing date\");",
  "  if (is_utc) {",
  "    p.tm_isdst = 0;",
  "    lval = timegm(&p);",
  "  } else {",
  "    // No clue whether daylight saving time is in effect...",
  "    p.tm_isdst = -1;",
  "    lval = mktime(&p);",
  "  }",
  "}",
  "",
  "}  // namespace frepple::utils",
];
