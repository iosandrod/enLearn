import { readFile } from "node:fs/promises";

import { XMLParser } from "fast-xml-parser";

import {
  parseDate,
  parseDuration,
  type EpochSeconds
} from "@suanfa/kernel";

import {
  Forecast,
  type ForecastBucket,
  type ForecastInputBucket
} from "./forecast.js";
import type { ForecastSolverOptions } from "./timeseries.js";

type XmlRecord = Record<string, unknown>;

export interface ForecastPlan {
  readonly current: EpochSeconds;
  readonly forecasts: readonly Forecast[];
  readonly orders: readonly SalesOrder[];
  readonly solverOptions: ForecastSolverOptions;
  readonly nettingOptions: NettingOptions;
}

export interface SalesOrder {
  readonly name: string;
  readonly item: string;
  readonly customer: string;
  readonly location: string;
  readonly deliveryOperation?: string;
  readonly due: EpochSeconds;
  readonly quantity: number;
  readonly priority: number;
}

export interface NettingOptions {
  readonly netEarlySeconds: number;
  readonly netLateSeconds: number;
  readonly netPastDemand: boolean;
  readonly netIgnoreLocation: boolean;
  readonly matchUsingDeliveryOperation: boolean;
}

interface ExpectedBucket {
  readonly start: EpochSeconds;
  readonly baseline: number;
  readonly override: number;
  readonly total: number;
  readonly net: number;
}

export async function loadForecastFixture(path: string): Promise<ForecastPlan> {
  return parseForecastFixture(await readFile(path, "utf8"));
}

export function parseForecastFixture(xml: string): ForecastPlan {
  const plan = planRecord(xml);
  const calendarBuckets = parseCalendarBuckets(plan);
  const current = parseDate(requiredText(plan.current, "plan current"));
  const forecasts = records(asRecord(plan.demands)?.demand).map((demand) =>
    parseForecast(demand, calendarBuckets)
  ).filter((forecast): forecast is Forecast => forecast !== undefined);
  const orders = records(asRecord(plan.demands)?.demand)
    .map(parseSalesOrder)
    .filter((order): order is SalesOrder => order !== undefined);
  const solverOptions = parseSolverOptions(xml);
  const nettingOptions = parseNettingOptions(xml);
  for (const forecast of forecasts) {
    forecast.resetNet(
      current,
      nettingOptions.netPastDemand,
      nettingOptions.netLateSeconds
    );
  }

  return {
    current,
    forecasts,
    orders,
    solverOptions,
    nettingOptions
  };
}

export async function compareForecastFixture(
  plan: ForecastPlan,
  expectedPath: string
): Promise<readonly string[]> {
  return compareForecastExpected(plan, await readFile(expectedPath, "utf8"));
}

export function compareForecastExpected(
  plan: ForecastPlan,
  expectedXml: string
): readonly string[] {
  const expectedPlan = planRecord(expectedXml);
  const expectedDemands = records(asRecord(expectedPlan.demands)?.demand);
  const expectedByName = new Map(
    expectedDemands.map((demand) => [
      requiredName(demand, "forecast demand"),
      parseExpectedBuckets(demand)
    ])
  );
  const differences: string[] = [];

  for (const forecast of plan.forecasts) {
    const expectedBuckets = expectedByName.get(forecast.name);
    if (!expectedBuckets) {
      differences.push(`Missing expected forecast "${forecast.name}"`);
      continue;
    }
    compareBuckets(forecast.name, forecast.buckets, expectedBuckets, differences);
  }

  return differences;
}

function parseForecast(
  demand: XmlRecord,
  calendarBuckets: readonly ForecastInputBucket[]
): Forecast | undefined {
  if (demand["@_xsi:type"] !== "demand_forecast") {
    return undefined;
  }
  const name = requiredName(demand, "forecast demand");
  const discrete = booleanValue(demand["@_discrete"], true);
  const rawBuckets = records(asRecord(demand.buckets)?.bucket);
  const buckets = calendarBuckets.map((calendarBucket) => {
    const source = rawBuckets.find(
      (bucket) => optionalText(bucket.start) === dateText(calendarBucket.start)
    );
    return {
      ...calendarBucket,
      ...(source ? parseInputMeasures(source) : {})
    };
  });
  const forecast = new Forecast(name, buckets, discrete, {
    ...identityEntry("item", entityName(demand.item)),
    ...identityEntry("customer", entityName(demand.customer)),
    ...identityEntry("location", entityName(demand.location)),
    ...identityEntry("deliveryOperation", entityName(demand.operation))
  });

  for (const rawBucket of rawBuckets) {
    const override = optionalNumber(rawBucket.forecastoverride);
    if (override === undefined) {
      continue;
    }
    const start = parseDate(requiredText(rawBucket.start, `override start in "${name}"`));
    const end = rawBucket.end
      ? parseDate(requiredText(rawBucket.end, `override end in "${name}"`))
      : matchingBucketEnd(buckets, start, name);
    forecast.distributeOverride({ start, end, value: override });
  }
  return forecast;
}

function parseSalesOrder(demand: XmlRecord): SalesOrder | undefined {
  if (demand["@_xsi:type"] === "demand_forecast") {
    return undefined;
  }
  const due = optionalText(demand.due);
  const quantity = optionalNumber(demand.quantity);
  const item = entityName(demand.item);
  const customer = entityName(demand.customer);
  const location = entityName(demand.location);
  if (!due || quantity === undefined || !item || !customer || !location) {
    return undefined;
  }
  const deliveryOperation = entityName(demand.operation);
  return {
    name: requiredName(demand, "sales order"),
    item,
    customer,
    location,
    ...(deliveryOperation === undefined ? {} : { deliveryOperation }),
    due: parseDate(due),
    quantity,
    priority: optionalNumber(demand.priority) ?? 0
  };
}

function parseCalendarBuckets(plan: XmlRecord): readonly ForecastInputBucket[] {
  const calendar = records(asRecord(plan.calendars)?.calendar)[0];
  if (!calendar) {
    throw new Error("Fixture has no planning calendar");
  }
  const rawBuckets = records(asRecord(calendar.buckets)?.bucket);
  const starts = rawBuckets.map((bucket) =>
    parseDate(requiredAttribute(bucket, "@_start", "calendar bucket"))
  );

  return rawBuckets.flatMap((bucket, index) => {
    const end = bucket["@_end"]
      ? parseDate(requiredAttribute(bucket, "@_end", "calendar bucket"))
      : starts[index + 1];
    if (end === undefined) {
      return [];
    }
    return [{
      start: starts[index] as EpochSeconds,
      end
    }];
  });
}

function parseInputMeasures(bucket: XmlRecord): Partial<ForecastInputBucket> {
  const orderTotal = optionalNumber(bucket.orderstotal);
  const baseline = optionalNumber(bucket.forecastbaseline);
  return {
    ...(orderTotal === undefined ? {} : { orderTotal }),
    ...(baseline === undefined ? {} : { baseline })
  };
}

function parseExpectedBuckets(demand: XmlRecord): ReadonlyMap<EpochSeconds, ExpectedBucket> {
  const expected = new Map<EpochSeconds, ExpectedBucket>();
  for (const bucket of records(asRecord(demand.buckets)?.bucket)) {
    const start = parseDate(requiredText(bucket.start, "expected bucket start"));
    const data = records(bucket.data);
    expected.set(start, {
      start,
      baseline: dataValue(data, "forecastbaseline"),
      override: dataValue(data, "forecastoverride"),
      total: dataValue(data, "forecasttotal"),
      net: dataValue(data, "forecastnet")
    });
  }
  return expected;
}

function compareBuckets(
  forecastName: string,
  actualBuckets: readonly ForecastBucket[],
  expectedBuckets: ReadonlyMap<EpochSeconds, ExpectedBucket>,
  differences: string[]
): void {
  for (const actual of actualBuckets) {
    const expected = expectedBuckets.get(actual.start);
    if (!expected) {
      differences.push(`${forecastName}: missing expected bucket at ${actual.start}`);
      continue;
    }
    compareMeasure(forecastName, actual.start, "forecastbaseline", actual.baseline ?? 0, expected.baseline, differences);
    compareMeasure(forecastName, actual.start, "forecastoverride", actual.override ?? 0, expected.override, differences);
    compareMeasure(forecastName, actual.start, "forecasttotal", actual.total, expected.total, differences);
    compareMeasure(forecastName, actual.start, "forecastnet", actual.net, expected.net, differences);
  }
}

function compareMeasure(
  forecastName: string,
  start: EpochSeconds,
  measure: string,
  actual: number,
  expected: number,
  differences: string[]
): void {
  if (Math.abs(actual - expected) > 1e-9) {
    differences.push(
      `${forecastName} ${start} ${measure}: expected ${expected}, got ${actual}`
    );
  }
}

function matchingBucketEnd(
  buckets: readonly ForecastInputBucket[],
  start: EpochSeconds,
  forecastName: string
): EpochSeconds {
  const bucket = buckets.find((candidate) => candidate.start === start);
  if (!bucket) {
    throw new RangeError(`Forecast "${forecastName}" has no bucket at ${start}`);
  }
  return bucket.end;
}

function planRecord(xml: string): XmlRecord {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    trimValues: true
  });
  const document = asRecord(parser.parse(stripEmbeddedPython(xml)));
  const plan = asRecord(document?.plan);
  if (!plan) {
    throw new Error("Fixture has no plan root");
  }
  return plan;
}

function dataValue(data: readonly XmlRecord[], name: string): number {
  const record = data.find((candidate) => candidate[`@_${name}`] !== undefined);
  return optionalNumber(record?.[`@_${name}`]) ?? 0;
}

function asRecord(value: unknown): XmlRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined;
}

function records(value: unknown): readonly XmlRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function requiredName(record: XmlRecord, entity: string): string {
  const attributeName = optionalText(record["@_name"]);
  const elementName = optionalText(record.name);
  const name = attributeName ?? elementName;
  if (!name) {
    throw new Error(`${entity} has no name`);
  }
  return name;
}

function requiredAttribute(record: XmlRecord, key: string, entity: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${entity} has no ${key}`);
  }
  return value;
}

function requiredText(value: unknown, entity: string): string {
  const text = optionalText(value);
  if (!text) {
    throw new Error(`${entity} is missing`);
  }
  return text;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new RangeError(`Invalid numeric value: ${String(value)}`);
  }
  return number;
}

function booleanValue(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  if (value === "true" || value === true || value === "1" || value === 1) {
    return true;
  }
  if (value === "false" || value === false || value === "0" || value === 0) {
    return false;
  }
  throw new RangeError(`Invalid boolean value: ${String(value)}`);
}

function dateText(value: EpochSeconds): string {
  return new Date(value * 1000).toISOString().replace(".000Z", "");
}

function stripEmbeddedPython(xml: string): string {
  return xml.replace(/<\?python[\s\S]*?\?>/g, "");
}

function parseSolverOptions(xml: string): ForecastSolverOptions {
  const match =
    /DeadAfterInactivity\s*=\s*(?:(\d+)\s*\*\s*)?(\d+)/.exec(xml);
  if (!match) {
    return {};
  }
  const multiplier = Number(match[1] ?? 1);
  const days = Number(match[2] ?? 0);
  return { deadAfterInactivityDays: multiplier * days };
}

function parseNettingOptions(xml: string): NettingOptions {
  const invocation = /solver_forecast\(([\s\S]*?)\)\.solve/.exec(xml)?.[1] ?? "";
  return {
    netEarlySeconds: durationOption(invocation, "Net_NetEarly"),
    netLateSeconds: durationOption(invocation, "Net_NetLate"),
    netPastDemand: booleanOption(invocation, "Net_PastDemand", false),
    netIgnoreLocation: booleanOption(invocation, "Net_IgnoreLocation", false),
    matchUsingDeliveryOperation: booleanOption(
      invocation,
      "Net_MatchUsingDeliveryOperation",
      true
    )
  };
}

function durationOption(invocation: string, name: string): number {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`).exec(invocation);
  return match?.[1] ? parseDuration(match[1]) : 0;
}

function booleanOption(
  invocation: string,
  name: string,
  defaultValue: boolean
): boolean {
  const match = new RegExp(`${name}\\s*=\\s*(True|False|true|false)`).exec(invocation);
  return match ? match[1]?.toLowerCase() === "true" : defaultValue;
}

function entityName(value: unknown): string | undefined {
  const record = asRecord(value);
  return optionalText(record?.["@_name"]) ?? optionalText(record?.name);
}

function identityEntry<Key extends "item" | "customer" | "location" | "deliveryOperation">(
  key: Key,
  value: string | undefined
): Partial<Record<Key, string>> {
  return value === undefined ? {} : { [key]: value } as Partial<Record<Key, string>>;
}
