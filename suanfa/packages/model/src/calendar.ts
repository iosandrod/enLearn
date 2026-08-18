import {
  INFINITE_FUTURE,
  INFINITE_PAST,
  type DurationSeconds,
  type EpochSeconds,
  durationSeconds,
  epochSeconds,
  startOfUtcDay,
  utcDayOfWeek
} from "@suanfa/kernel";

export interface CalendarBucketInput {
  readonly start: EpochSeconds;
  readonly end?: EpochSeconds;
  readonly value: number;
  readonly priority?: number;
  readonly days?: number;
  readonly startTime?: DurationSeconds;
  readonly endTime?: DurationSeconds;
}

export interface CalendarEvent {
  readonly date: EpochSeconds;
  readonly value: number;
}

export class CalendarBucket {
  public readonly end: EpochSeconds;
  public readonly priority: number;
  public readonly days: number;
  public readonly startTime: DurationSeconds;
  public readonly endTime: DurationSeconds;

  public constructor(
    public readonly sequence: number,
    public readonly start: EpochSeconds,
    public readonly value: number,
    options: Omit<CalendarBucketInput, "start" | "value"> = {}
  ) {
    this.end = options.end ?? INFINITE_FUTURE;
    this.priority = options.priority ?? 0;
    this.days = options.days ?? 127;
    this.startTime = options.startTime ?? durationSeconds(0);
    this.endTime = options.endTime ?? durationSeconds(86_400);

    if (this.end < this.start) {
      throw new RangeError("Calendar bucket end must not precede its start");
    }
    if (this.days < 0 || this.days > 127) {
      throw new RangeError("Calendar bucket days must be between 0 and 127");
    }
    if (
      this.startTime < 0 ||
      this.endTime > 86_400 ||
      this.startTime > this.endTime
    ) {
      throw new RangeError("Invalid calendar bucket daily time range");
    }
  }

  public isContinuous(): boolean {
    return this.days === 127 && this.startTime === 0 && this.endTime === 86_400;
  }

  public matches(date: EpochSeconds, forward = true): boolean {
    if (this.start === this.end) {
      return false;
    }

    if (forward) {
      if (date < this.start || date >= this.end) {
        return false;
      }
    } else if (date <= this.start || date > this.end) {
      return false;
    }

    if (this.isContinuous()) {
      return true;
    }

    let effectiveDate = date;
    let secondsOfDay = date - startOfUtcDay(date);
    if (!forward && secondsOfDay === 0) {
      effectiveDate = epochSeconds(date - 86_400);
      secondsOfDay = 86_400;
    }

    return (
      (this.days & (1 << utcDayOfWeek(effectiveDate))) !== 0 &&
      (forward
        ? secondsOfDay >= this.startTime && secondsOfDay < this.endTime
        : secondsOfDay > this.startTime && secondsOfDay <= this.endTime)
    );
  }
}

export class Calendar {
  private readonly sortedBuckets: readonly CalendarBucket[];

  public constructor(
    public readonly name: string,
    public readonly defaultValue: number,
    buckets: readonly CalendarBucketInput[]
  ) {
    this.sortedBuckets = buckets
      .map(
        (bucket, sequence) =>
          new CalendarBucket(sequence, bucket.start, bucket.value, bucket)
      )
      .sort(
        (left, right) =>
          left.start - right.start ||
          left.priority - right.priority ||
          left.sequence - right.sequence
      );
  }

  public get buckets(): readonly CalendarBucket[] {
    return this.sortedBuckets;
  }

  public winnerAt(date: EpochSeconds, forward = true): CalendarBucket | undefined {
    let winner: CalendarBucket | undefined;
    let priority = Number.POSITIVE_INFINITY;

    for (const bucket of this.sortedBuckets) {
      if (bucket.start > date) {
        break;
      }
      if (bucket.priority < priority && bucket.matches(date, forward)) {
        winner = bucket;
        priority = bucket.priority;
      }
    }

    return winner;
  }

  public valueAt(date: EpochSeconds, forward = true): number {
    return this.winnerAt(date, forward)?.value ?? this.defaultValue;
  }

  public events(): readonly CalendarEvent[] {
    const candidates = this.buildCandidateDates();
    const events: CalendarEvent[] = [
      { date: INFINITE_PAST, value: this.valueAt(INFINITE_PAST) }
    ];

    for (const date of candidates) {
      const before = this.winnerAt(epochSeconds(date - 1));
      const current = this.winnerAt(date);
      if (before !== current) {
        events.push({ date, value: current?.value ?? this.defaultValue });
      }
    }

    return events;
  }

  public eventsBackward(start: EpochSeconds): readonly CalendarEvent[] {
    const events: CalendarEvent[] = [{ date: start, value: this.valueAt(start, false) }];

    for (const event of this.events().toReversed()) {
      if (event.date !== INFINITE_PAST && event.date < start) {
        events.push({ date: event.date, value: this.valueAt(event.date, false) });
      }
    }

    return events;
  }

  private buildCandidateDates(): readonly EpochSeconds[] {
    const candidates = new Set<number>();

    for (const bucket of this.sortedBuckets) {
      this.addCandidate(candidates, bucket.start);
      this.addCandidate(candidates, bucket.end);

      if (!bucket.isContinuous()) {
        this.addDailyCandidates(candidates, bucket);
      }
    }

    return [...candidates]
      .sort((left, right) => left - right)
      .map((value) => epochSeconds(value));
  }

  private addDailyCandidates(candidates: Set<number>, bucket: CalendarBucket): void {
    let day = startOfUtcDay(bucket.start);
    const lastDay = startOfUtcDay(epochSeconds(bucket.end - 1));

    while (day <= lastDay) {
      if ((bucket.days & (1 << utcDayOfWeek(day))) !== 0) {
        this.addCandidate(candidates, epochSeconds(day + bucket.startTime));
        this.addCandidate(candidates, epochSeconds(day + bucket.endTime));
      }
      day = epochSeconds(day + 86_400);
    }
  }

  private addCandidate(candidates: Set<number>, date: EpochSeconds): void {
    if (date > INFINITE_PAST && date < INFINITE_FUTURE) {
      candidates.add(date);
    }
  }
}
