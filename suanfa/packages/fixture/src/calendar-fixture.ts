import { readFile } from "node:fs/promises";

import { XMLParser } from "fast-xml-parser";

import {
  INFINITE_FUTURE,
  type DurationSeconds,
  type EpochSeconds,
  formatDate,
  parseDate,
  parseDuration
} from "@suanfa/kernel";
import {
  Calendar,
  type CalendarBucketInput,
  type CalendarEvent
} from "@suanfa/model";

interface XmlCalendar {
  readonly "@_name": string;
  readonly default?: string | number;
  readonly buckets?: {
    readonly bucket?: XmlCalendarBucket | readonly XmlCalendarBucket[];
  };
}

interface XmlCalendarBucket {
  readonly "@_start": string;
  readonly "@_end"?: string;
  readonly "@_value": string | number;
  readonly "@_priority"?: string | number;
  readonly "@_days"?: string | number;
  readonly "@_starttime"?: string;
  readonly "@_endtime"?: string;
}

interface XmlPlan {
  readonly plan?: {
    readonly calendars?: {
      readonly calendar?: XmlCalendar | readonly XmlCalendar[];
    };
  };
}

export async function loadCalendarFixture(path: string): Promise<readonly Calendar[]> {
  return parseCalendarFixture(await readFile(path, "utf8"));
}

export function parseCalendarFixture(xml: string): readonly Calendar[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    trimValues: true
  });
  const document = parser.parse(stripEmbeddedPython(xml)) as XmlPlan;
  const calendars = toArray(document.plan?.calendars?.calendar);

  return calendars.map(
    (calendar) =>
      new Calendar(
        calendar["@_name"],
        numberValue(calendar.default, 0),
        toArray(calendar.buckets?.bucket).map(parseBucket)
      )
  );
}

export function renderCalendarFixture(
  calendars: readonly Calendar[],
  backwardStart: EpochSeconds
): string {
  const lines = ["FORWARD ITERATION"];
  for (const calendar of calendars) {
    lines.push(`  ${calendar.name} :`);
    appendEvents(lines, calendar.events());
  }

  lines.push("BACKWARD ITERATION");
  for (const calendar of calendars) {
    lines.push(`  ${calendar.name} :`);
    appendEvents(lines, calendar.eventsBackward(backwardStart));
  }

  return `${lines.join("\n")}\n`;
}

function parseBucket(bucket: XmlCalendarBucket): CalendarBucketInput {
  return {
    start: parseDate(bucket["@_start"]),
    end: bucket["@_end"] ? parseDate(bucket["@_end"]) : INFINITE_FUTURE,
    value: numberValue(bucket["@_value"], 0),
    priority: numberValue(bucket["@_priority"], 0),
    days: numberValue(bucket["@_days"], 127),
    startTime: durationValue(bucket["@_starttime"], 0),
    endTime: durationValue(bucket["@_endtime"], 86_400)
  };
}

function appendEvents(lines: string[], events: readonly CalendarEvent[]): void {
  for (const event of events) {
    lines.push(`    ${formatCalendarDate(event.date)} - ${formatValue(event.value)}`);
  }
}

function formatCalendarDate(value: EpochSeconds): string {
  return formatDate(value).replace("T", " ");
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function durationValue(value: string | undefined, defaultValue: number): DurationSeconds {
  return value ? parseDuration(value) : (defaultValue as DurationSeconds);
}

function numberValue(value: string | number | undefined, defaultValue: number): number {
  return value === undefined ? defaultValue : Number(value);
}

function toArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as readonly T[];
  }
  return [value as T];
}

export function stripEmbeddedPython(xml: string): string {
  return xml.replace(/<\?python[\s\S]*?\?>/g, "");
}
