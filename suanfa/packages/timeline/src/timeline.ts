import {
  ROUNDING_ERROR,
  Sequence,
  compareNumbers,
  type EpochSeconds
} from "@suanfa/kernel";

export enum TimelineEventType {
  ChangeOnhand = 1,
  SetOnhand = 2,
  SetMinimum = 3,
  SetMaximum = 4,
  SetupChange = 5
}

export interface TimelineEventInput {
  readonly date: EpochSeconds;
  readonly quantity?: number;
  readonly type?: TimelineEventType;
  readonly operationPlanOrder?: number;
  readonly setOnhand?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export class TimelineEvent {
  public readonly sequence: number;
  public readonly type: TimelineEventType;
  public readonly operationPlanOrder: number | undefined;
  public readonly setOnhand: number | undefined;
  public readonly minimum: number | undefined;
  public readonly maximum: number | undefined;
  public date: EpochSeconds;
  public quantity: number;
  public onhand = 0;
  public cumulativeProduced = 0;
  public previous: TimelineEvent | undefined;
  public next: TimelineEvent | undefined;

  public constructor(sequence: number, input: TimelineEventInput) {
    this.sequence = sequence;
    this.type = input.type ?? TimelineEventType.ChangeOnhand;
    this.date = input.date;
    this.quantity = input.quantity ?? 0;
    this.operationPlanOrder = input.operationPlanOrder;
    this.setOnhand = input.setOnhand;
    this.minimum = input.minimum;
    this.maximum = input.maximum;

    if (this.type === TimelineEventType.SetOnhand && this.setOnhand === undefined) {
      throw new RangeError("Set-onhand events require a setOnhand value");
    }
    if (this.type === TimelineEventType.SetMinimum && this.minimum === undefined) {
      throw new RangeError("Minimum events require a minimum value");
    }
    if (this.type === TimelineEventType.SetMaximum && this.maximum === undefined) {
      throw new RangeError("Maximum events require a maximum value");
    }
  }

  public isLastOnDate(): boolean {
    return this.next === undefined || this.next.date !== this.date;
  }

  public isFirstOnDate(): boolean {
    return this.previous === undefined || this.previous.date !== this.date;
  }

  public get onhandBeforeDate(): number {
    let event = this.previous;
    while (event !== undefined && event.date === this.date) {
      event = event.previous;
    }
    return event?.onhand ?? 0;
  }

  public get onhandAfterDate(): number {
    let event = this.next;
    while (event?.next !== undefined && event.next.date === this.date) {
      event = event.next;
    }
    return event?.onhand ?? this.onhand;
  }

  public get cumulativeConsumed(): number {
    return this.cumulativeProduced - this.onhand;
  }
}

export class Timeline {
  private readonly sequence = new Sequence();
  private first: TimelineEvent | undefined;
  private last: TimelineEvent | undefined;
  private count = 0;

  public get size(): number {
    return this.count;
  }

  public get head(): TimelineEvent | undefined {
    return this.first;
  }

  public get tail(): TimelineEvent | undefined {
    return this.last;
  }

  public insert(input: TimelineEventInput): TimelineEvent {
    const event = new TimelineEvent(this.sequence.next(), input);
    this.attach(event);
    this.recompute();
    return event;
  }

  public erase(event: TimelineEvent): void {
    this.assertAttached(event);
    this.detach(event);
    this.recompute();
  }

  public update(
    event: TimelineEvent,
    patch: Pick<TimelineEventInput, "date" | "quantity">
  ): void {
    this.assertAttached(event);
    this.detach(event);
    event.date = patch.date;
    event.quantity = patch.quantity ?? event.quantity;
    this.attach(event);
    this.recompute();
  }

  public eventAtOrBefore(
    date: EpochSeconds,
    inclusive = true
  ): TimelineEvent | undefined {
    let event = this.last;
    while (
      event !== undefined &&
      (inclusive ? event.date > date : event.date >= date)
    ) {
      event = event.previous;
    }
    return event;
  }

  public getMinimum(date: EpochSeconds, inclusive = true): number {
    let result = 0;
    for (const event of this) {
      if (event.date > date || (!inclusive && event.date === date)) {
        break;
      }
      if (event.type === TimelineEventType.SetMinimum) {
        result = event.minimum ?? 0;
      }
    }
    return result;
  }

  public getMaximum(date: EpochSeconds, inclusive = true): number {
    let result = 0;
    for (const event of this) {
      if (event.date > date || (!inclusive && event.date === date)) {
        break;
      }
      if (event.type === TimelineEventType.SetMaximum) {
        result = event.maximum ?? 0;
      }
    }
    return result;
  }

  public availableFrom(event: TimelineEvent): number {
    this.assertAttached(event);
    let available = event.onhandAfterDate;
    for (let current: TimelineEvent | undefined = event; current; current = current.next) {
      if (current.isLastOnDate() && current.onhand < available) {
        available = current.onhand;
        if (available < ROUNDING_ERROR) {
          return 0;
        }
      }
    }
    return available;
  }

  public toArray(): readonly TimelineEvent[] {
    return [...this];
  }

  public check(): boolean {
    let previous: TimelineEvent | undefined;
    let onhand = 0;
    let cumulativeProduced = 0;
    let observedCount = 0;

    for (let event = this.first; event; event = event.next) {
      if (event.previous !== previous) {
        return false;
      }
      if (previous && this.compare(previous, event) >= 0) {
        return false;
      }

      if (event.type === TimelineEventType.SetOnhand) {
        onhand = event.setOnhand ?? 0;
      } else {
        onhand += event.quantity;
        if (event.quantity > 0) {
          cumulativeProduced += event.quantity;
        }
      }
      if (
        compareNumbers(event.onhand, onhand) !== 0 ||
        compareNumbers(event.cumulativeProduced, cumulativeProduced) !== 0
      ) {
        return false;
      }
      previous = event;
      observedCount += 1;
    }

    return previous === this.last && observedCount === this.count;
  }

  public *[Symbol.iterator](): IterableIterator<TimelineEvent> {
    for (let event = this.first; event; event = event.next) {
      yield event;
    }
  }

  private attach(event: TimelineEvent): void {
    let cursor = this.last;
    while (cursor !== undefined && this.compare(event, cursor) < 0) {
      cursor = cursor.previous;
    }

    if (cursor === undefined) {
      event.previous = undefined;
      event.next = this.first;
      if (this.first) {
        this.first.previous = event;
      } else {
        this.last = event;
      }
      this.first = event;
    } else {
      event.previous = cursor;
      event.next = cursor.next;
      if (cursor.next) {
        cursor.next.previous = event;
      } else {
        this.last = event;
      }
      cursor.next = event;
    }
    this.count += 1;
  }

  private detach(event: TimelineEvent): void {
    if (event.previous) {
      event.previous.next = event.next;
    } else {
      this.first = event.next;
    }
    if (event.next) {
      event.next.previous = event.previous;
    } else {
      this.last = event.previous;
    }
    event.previous = undefined;
    event.next = undefined;
    this.count -= 1;
  }

  private recompute(): void {
    let onhand = 0;
    let cumulativeProduced = 0;

    for (const event of this) {
      if (event.type === TimelineEventType.SetOnhand) {
        onhand = event.setOnhand ?? 0;
      } else {
        onhand += event.quantity;
        if (event.quantity > 0) {
          cumulativeProduced += event.quantity;
        }
      }
      event.onhand = onhand;
      event.cumulativeProduced = cumulativeProduced;
    }
  }

  private compare(left: TimelineEvent, right: TimelineEvent): number {
    if (left.date !== right.date) {
      return left.date - right.date;
    }

    if (
      left.type === TimelineEventType.SetupChange ||
      right.type === TimelineEventType.SetupChange
    ) {
      if (
        left.type === TimelineEventType.SetupChange &&
        right.type === TimelineEventType.SetupChange
      ) {
        return this.compareOperationPlan(left, right);
      }
      return right.type - left.type;
    }

    if (left.type !== right.type) {
      return right.type - left.type;
    }

    const quantityComparison = compareNumbers(right.quantity, left.quantity);
    if (quantityComparison !== 0) {
      return quantityComparison;
    }

    const operationPlanComparison = this.compareOperationPlan(left, right);
    return operationPlanComparison !== 0
      ? operationPlanComparison
      : left.sequence - right.sequence;
  }

  private compareOperationPlan(left: TimelineEvent, right: TimelineEvent): number {
    if (
      left.operationPlanOrder !== undefined &&
      right.operationPlanOrder !== undefined
    ) {
      return left.operationPlanOrder - right.operationPlanOrder;
    }
    if (left.operationPlanOrder === undefined && right.operationPlanOrder !== undefined) {
      return -1;
    }
    if (left.operationPlanOrder !== undefined && right.operationPlanOrder === undefined) {
      return 1;
    }
    return left.sequence - right.sequence;
  }

  private assertAttached(event: TimelineEvent): void {
    if (event !== this.first && event.previous === undefined && event.next === undefined) {
      throw new Error("Timeline event is not attached to this timeline");
    }
  }
}
