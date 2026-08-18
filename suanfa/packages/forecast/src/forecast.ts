import type { EpochSeconds } from "@suanfa/kernel";

export interface ForecastBucket {
  readonly start: EpochSeconds;
  readonly end: EpochSeconds;
  readonly orderTotal: number;
  readonly baseline?: number;
  readonly override?: number;
  readonly consumed: number;
  readonly total: number;
  readonly net: number;
  readonly quantity: number;
}

export interface ForecastIdentity {
  readonly item?: string;
  readonly customer?: string;
  readonly location?: string;
  readonly deliveryOperation?: string;
}

export interface ForecastInputBucket {
  readonly start: EpochSeconds;
  readonly end: EpochSeconds;
  readonly baseline?: number;
  readonly orderTotal?: number;
  readonly override?: number;
}

export interface ForecastOverrideUpdate {
  readonly start: EpochSeconds;
  readonly end: EpochSeconds;
  readonly value: number;
  readonly add?: boolean;
}

export class Forecast {
  private readonly states: ForecastBucketState[];
  public method = 0;
  public smapeError = 0;
  public deviation = 0;

  public constructor(
    public readonly name: string,
    buckets: readonly ForecastInputBucket[],
    public readonly discrete = true,
    public readonly identity: ForecastIdentity = {}
  ) {
    if (buckets.length === 0) {
      throw new RangeError(`Forecast "${name}" requires at least one bucket`);
    }

    this.states = [...buckets]
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .map((bucket) => new ForecastBucketState(bucket));

    for (let index = 1; index < this.states.length; index += 1) {
      const previous = this.states[index - 1];
      const current = this.states[index];
      if (!previous || !current) {
        continue;
      }
      if (previous.end > current.start) {
        throw new RangeError(`Forecast "${name}" has overlapping buckets`);
      }
    }
  }

  public get buckets(): readonly ForecastBucket[] {
    return this.states.map((state) => state.snapshot());
  }

  public distributeOverride(update: ForecastOverrideUpdate): void {
    if (update.end <= update.start) {
      throw new RangeError("Forecast override range must have a positive duration");
    }

    const affected = this.states.filter((bucket) => overlaps(bucket, update));
    const totalWeight = affected.reduce(
      (sum, bucket) => sum + overlapDuration(bucket, update),
      0
    );
    if (totalWeight === 0) {
      if (update.value !== 0) {
        throw new RangeError(
          `Forecast override range does not overlap buckets in "${this.name}"`
        );
      }
      return;
    }

    const rate = update.value / totalWeight;
    let carryover = 0;
    for (const bucket of affected) {
      const weightedValue = rate * overlapDuration(bucket, update);
      const value = this.discrete
        ? roundedDiscreteValue(weightedValue, carryover)
        : weightedValue;
      if (this.discrete) {
        carryover += weightedValue - value;
      }

      bucket.override = update.add ? (bucket.override ?? 0) + value : value;
    }
  }

  public setBaseline(start: EpochSeconds, value: number): void {
    const bucket = this.states.find((candidate) => candidate.start === start);
    if (!bucket) {
      throw new RangeError(`Forecast bucket starting at ${start} does not exist`);
    }
    bucket.baseline = this.discrete ? Math.floor(value + 1e-9) : value;
  }

  public setMetrics(method: number, smapeError: number, deviation: number): void {
    this.method = method;
    this.smapeError = smapeError;
    this.deviation = deviation;
  }

  public resetNet(
    current: EpochSeconds,
    netPastDemand = false,
    netLateSeconds = 0
  ): void {
    for (const bucket of this.states) {
      bucket.consumed = 0;
      bucket.nettingEnabled =
        bucket.end >= current - (netPastDemand ? netLateSeconds : 0) &&
        bucket.total !== 0;
    }
  }

  public bucketIndexAt(date: EpochSeconds): number {
    return this.states.findIndex(
      (bucket) => bucket.start <= date && date < bucket.end
    );
  }

  public availableNet(index: number): number {
    const bucket = this.states[index];
    return bucket?.net ?? 0;
  }

  public consume(index: number, quantity: number): number {
    const bucket = this.states[index];
    if (!bucket || quantity <= 0) {
      return 0;
    }
    const consumed = Math.min(quantity, bucket.net);
    bucket.consumed += consumed;
    return consumed;
  }

  public bucketStart(index: number): EpochSeconds | undefined {
    return this.states[index]?.start;
  }

  public bucketEnd(index: number): EpochSeconds | undefined {
    return this.states[index]?.end;
  }
}

class ForecastBucketState {
  public baseline: number | undefined;
  public override: number | undefined;
  public consumed = 0;
  public nettingEnabled = false;

  public constructor(
    public readonly input: ForecastInputBucket
  ) {
    this.baseline = input.baseline;
    this.override = input.override;
  }

  public get start(): EpochSeconds {
    return this.input.start;
  }

  public get end(): EpochSeconds {
    return this.input.end;
  }

  public get total(): number {
    return this.override ?? this.baseline ?? 0;
  }

  public get net(): number {
    return this.nettingEnabled ? this.total - this.consumed : 0;
  }

  public snapshot(): ForecastBucket {
    const total = this.total;
    const net = this.net;
    return {
      start: this.start,
      end: this.end,
      orderTotal: this.input.orderTotal ?? 0,
      ...(this.baseline === undefined ? {} : { baseline: this.baseline }),
      ...(this.override === undefined ? {} : { override: this.override }),
      consumed: this.consumed,
      total,
      net,
      quantity: net
    };
  }
}

function overlaps(bucket: ForecastBucketState, update: ForecastOverrideUpdate): boolean {
  return bucket.start < update.end && update.start < bucket.end;
}

function overlapDuration(
  bucket: ForecastBucketState,
  update: ForecastOverrideUpdate
): number {
  return Math.max(0, Math.min(bucket.end, update.end) - Math.max(bucket.start, update.start));
}

function roundedDiscreteValue(value: number, carryover: number): number {
  const rounded = Math.ceil(carryover + value - 0.5);
  return rounded === 0 ? 0 : rounded;
}
