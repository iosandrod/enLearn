export type EpochSeconds = number & { readonly __epochSeconds: unique symbol };
export type DurationSeconds = number & {
  readonly __durationSeconds: unique symbol;
};

export const INFINITE_PAST = 31_536_000 as EpochSeconds;
export const INFINITE_FUTURE = 1_924_905_600 as EpochSeconds;

const ISO_DURATION = /^(-?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

export function epochSeconds(value: number): EpochSeconds {
  if (!Number.isFinite(value)) {
    throw new RangeError("Epoch seconds must be finite");
  }

  return Math.trunc(value) as EpochSeconds;
}

export function durationSeconds(value: number): DurationSeconds {
  if (!Number.isFinite(value)) {
    throw new RangeError("Duration seconds must be finite");
  }

  return value as DurationSeconds;
}

export function parseDate(value: string): EpochSeconds {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
  const milliseconds = Date.parse(normalized);
  if (Number.isNaN(milliseconds) || milliseconds % 1000 !== 0) {
    throw new RangeError(`Invalid second-precision date: ${value}`);
  }

  return clampDate(epochSeconds(milliseconds / 1000));
}

export function formatDate(value: EpochSeconds): string {
  return new Date(value * 1000).toISOString().replace(".000Z", "");
}

export function parseDuration(value: string): DurationSeconds {
  const match = ISO_DURATION.exec(value);
  if (!match) {
    throw new RangeError(`Unsupported ISO duration: ${value}`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const days = Number(match[2] ?? 0);
  const hours = Number(match[3] ?? 0);
  const minutes = Number(match[4] ?? 0);
  const seconds = Number(match[5] ?? 0);
  return durationSeconds(
    sign * (days * 86_400 + hours * 3_600 + minutes * 60 + seconds)
  );
}

export function addDuration(
  date: EpochSeconds,
  duration: DurationSeconds
): EpochSeconds {
  return clampDate(epochSeconds(date + duration));
}

export function clampDate(value: EpochSeconds): EpochSeconds {
  if (value < INFINITE_PAST) {
    return INFINITE_PAST;
  }
  if (value > INFINITE_FUTURE) {
    return INFINITE_FUTURE;
  }
  return value;
}

export function utcDayOfWeek(value: EpochSeconds): number {
  return new Date(value * 1000).getUTCDay();
}

export function startOfUtcDay(value: EpochSeconds): EpochSeconds {
  const date = new Date(value * 1000);
  return epochSeconds(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000
  );
}
