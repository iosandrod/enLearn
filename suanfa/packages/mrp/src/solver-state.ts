import type { EpochSeconds } from "@suanfa/kernel";

export interface SolverRequest {
  readonly qQty: number;
  readonly qDate: EpochSeconds;
  readonly qDateMax: EpochSeconds;
  readonly qQtyMin: number;
  readonly requireFull: boolean;
  readonly forceLate: boolean;
  readonly acceptPartialReply: boolean;
  readonly currentBuffer?: string;
  readonly currentDemand?: string;
  readonly ownerOperation?: string;
}

export interface SolverReply {
  readonly aQty: number;
  readonly aDate: EpochSeconds;
  readonly cost: number;
  readonly penalty: number;
  readonly acceptPartialReply: boolean;
}

export function createSolverRequest(
  request: Omit<
    SolverRequest,
    "qDateMax" | "qQtyMin" | "requireFull" | "forceLate" |
      "acceptPartialReply"
  > & Partial<Pick<
    SolverRequest,
    "qDateMax" | "qQtyMin" | "requireFull" | "forceLate" |
      "acceptPartialReply"
  >>
): SolverRequest {
  assertFinite("qQty", request.qQty);
  assertFinite("qDate", request.qDate);
  const qDateMax = request.qDateMax ?? request.qDate;
  assertFinite("qDateMax", qDateMax);
  const qQtyMin = request.qQtyMin ?? 0;
  assertFinite("qQtyMin", qQtyMin);
  if (request.qQty < 0 || qQtyMin < 0) {
    throw new RangeError("Solver request quantities must be non-negative");
  }
  return {
    ...request,
    qDateMax,
    qQtyMin,
    requireFull: request.requireFull ?? false,
    forceLate: request.forceLate ?? false,
    acceptPartialReply: request.acceptPartialReply ?? false
  };
}

export function quantityReply(
  request: SolverRequest,
  quantity: number,
  infiniteFuture: EpochSeconds,
  acceptPartialReply = false
): SolverReply {
  assertFinite("aQty", quantity);
  if (quantity < 0 || quantity > request.qQty + 1e-9) {
    throw new RangeError(
      `Solver answer quantity ${quantity} is outside request [0, ${request.qQty}]`
    );
  }
  return {
    aQty: quantity,
    aDate: infiniteFuture,
    cost: 0,
    penalty: 0,
    acceptPartialReply
  };
}

export function nextDateReply(nextDate: EpochSeconds): SolverReply {
  assertFinite("aDate", nextDate);
  return {
    aQty: 0,
    aDate: nextDate,
    cost: 0,
    penalty: 0,
    acceptPartialReply: false
  };
}

interface MutableBookmark<T> {
  readonly id: number;
  readonly snapshot: T;
  active: boolean;
}

export interface PlanningBookmark {
  readonly id: number;
}

export class PlanningTransactionManager<T> {
  private readonly bookmarks: MutableBookmark<T>[] = [];
  private nextId = 1;

  public constructor(
    private readonly capture: () => T,
    private readonly restore: (snapshot: T) => void
  ) {}

  public setBookmark(): PlanningBookmark {
    const bookmark: MutableBookmark<T> = {
      id: this.nextId,
      snapshot: this.capture(),
      active: true
    };
    this.nextId += 1;
    this.bookmarks.push(bookmark);
    return { id: bookmark.id };
  }

  public rollback(bookmark: PlanningBookmark): void {
    const index = this.bookmarkIndex(bookmark);
    const selected = this.bookmarks[index]!;
    this.restore(selected.snapshot);
    this.closeFrom(index);
  }

  public commit(bookmark: PlanningBookmark): void {
    const index = this.bookmarkIndex(bookmark);
    this.closeFrom(index);
  }

  public get depth(): number {
    return this.bookmarks.length;
  }

  private bookmarkIndex(bookmark: PlanningBookmark): number {
    const index = this.bookmarks.findIndex(
      (candidate) => candidate.id === bookmark.id && candidate.active
    );
    if (index < 0) {
      throw new Error(`Planning bookmark ${bookmark.id} is no longer active`);
    }
    return index;
  }

  private closeFrom(index: number): void {
    for (const bookmark of this.bookmarks.splice(index)) {
      bookmark.active = false;
    }
  }
}

export interface SolverGuardOptions {
  readonly maximumDepth?: number;
  readonly maximumVisits?: number;
}

export class SolverGuard {
  private readonly active = new Set<string>();
  private visits = 0;
  private readonly maximumDepth: number;
  private readonly maximumVisits: number;

  public constructor(options: SolverGuardOptions = {}) {
    this.maximumDepth = options.maximumDepth ?? 256;
    this.maximumVisits = options.maximumVisits ?? 1_000_000;
  }

  public enter<T>(signature: string, solve: () => T): T {
    this.visits += 1;
    if (this.visits > this.maximumVisits) {
      throw new Error(
        `Solver visit limit ${this.maximumVisits} exceeded at ${signature}`
      );
    }
    if (this.active.size >= this.maximumDepth) {
      throw new Error(
        `Solver recursion depth ${this.maximumDepth} exceeded at ${signature}`
      );
    }
    if (this.active.has(signature)) {
      throw new Error(`Solver cycle detected at ${signature}`);
    }
    this.active.add(signature);
    try {
      return solve();
    } finally {
      this.active.delete(signature);
    }
  }

  public get visitCount(): number {
    return this.visits;
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}
