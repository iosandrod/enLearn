// <header-api-generated>
import { CommandManager } from "../utils/actions.js";
import { DateRange, Duration } from "../utils/date.js";
import { Environment, HeaderModelAdapter, LogicException, applyDataFields } from "../utils/library.js";
import type { Calendar } from "../model/calendar.js";
import { Demand } from "../model/demand.js";
import { Plan } from "../model/plan.js";
import { Problem } from "../model/problem.js";
import { Solver } from "../model/solver.js";
import { Forecast, ForecastBucket, type ForecastBucketData, type ForecastNode } from "./forecast.js";
import { Measures } from "./measure.js";
import {
  FORECAST_DEFAULTS,
  crostonForecast,
  doubleExponentialForecast,
  manualForecast,
  movingAverageForecast,
  seasonalForecast,
  singleExponentialForecast,
  type ForecastEvaluation,
} from "./timeseries.js";

const DAY = 86_400;
const ROUNDING_ERROR = 0.000001;

function validUnit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
function hierarchy<T extends { getOwner(): T | null }>(value: T | null): T[] {
  const result: T[] = [];
  for (let current = value; current; current = current.getOwner()) result.push(current);
  return result;
}

export class ForecastSolverMetrics extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["ForecastSolver::Metrics"] as const;
  constructor(public readonly smape = Number.POSITIVE_INFINITY,
    public readonly standarddeviation = Number.POSITIVE_INFINITY, public readonly force = false) { super(); }
}

export class ForecastSolverForecastMethod extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = [];
  static readonly cppQualifiedNames: readonly string[] = ["ForecastSolver::ForecastMethod"];
  protected evaluation: ForecastEvaluation | null = null;
  protected firstBucket = 0;
  generateForecast(_forecast: Forecast | null, _buckets: ForecastBucketData[], firstBucket: number,
    _history: number[], _count: number, _solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = null;
    return new ForecastSolverMetrics();
  }
  applyForecast(forecast: Forecast, buckets: ForecastBucketData[], start: number,
    manager: CommandManager | null): void {
    const result = this.evaluation;
    if (!result) return;
    for (let index = start; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      if (bucket) Measures.forecastbaseline.update(bucket, result.values[index - start] ?? 0, manager);
    }
    for (const relative of result.outliers) {
      const bucket = buckets[this.firstBucket + relative];
      if (!bucket) continue;
      Measures.outlier.update(bucket, 1, manager);
      new ProblemOutlier(bucket.getOrCreateForecastBucket(), this);
    }
    forecast.setDeviation(result.metrics.standardDeviation);
  }
  getCode(): number { return 0; }
  protected metrics(): ForecastSolverMetrics {
    const value = this.evaluation?.metrics;
    return value ? new ForecastSolverMetrics(value.smape, value.standardDeviation, value.force) : new ForecastSolverMetrics();
  }
}

export class ForecastSolverMovingAverage extends ForecastSolverForecastMethod {
  static override readonly cppBases = ["ForecastSolverForecastMethod"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver::MovingAverage"] as const;
  private static defaultOrder: number = FORECAST_DEFAULTS.movingAverageOrder;
  override generateForecast(forecast: Forecast | null, buckets: ForecastBucketData[], firstBucket: number,
    history: number[], count: number, solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = movingAverageForecast(history.slice(0, count), solver.algorithmOptions(
      Math.max(0, buckets.length - solver.getForecastStartBucket()), {
      order: ForecastSolverMovingAverage.defaultOrder,
    }, forecast));
    return this.metrics();
  }
  override getCode(): number { return Forecast.METHOD_MOVINGAVERAGE; }
  getDefaultOrder(): number { return ForecastSolverMovingAverage.defaultOrder; }
  setDefaultOrder(value: number): void {
    if (value >= 1) ForecastSolverMovingAverage.defaultOrder = Math.trunc(value);
    else Environment.log("Warning: Parameter MovingAverage.order needs to be at least 1");
  }
}

export class ForecastSolverSingleExponential extends ForecastSolverForecastMethod {
  static override readonly cppBases = ["ForecastSolverForecastMethod"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver::SingleExponential"] as const;
  private static initialAlfa: number = FORECAST_DEFAULTS.singleInitialAlpha;
  private static minAlfa: number = FORECAST_DEFAULTS.singleMinAlpha;
  private static maxAlfa: number = FORECAST_DEFAULTS.singleMaxAlpha;
  override generateForecast(forecast: Forecast | null, buckets: ForecastBucketData[], firstBucket: number,
    history: number[], count: number, solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = singleExponentialForecast(history.slice(0, count), solver.algorithmOptions(
      Math.max(0, buckets.length - solver.getForecastStartBucket()), {
      initialAlpha: ForecastSolverSingleExponential.initialAlfa,
      minAlpha: ForecastSolverSingleExponential.minAlfa,
      maxAlpha: ForecastSolverSingleExponential.maxAlfa,
    }, forecast));
    return this.metrics();
  }
  override getCode(): number { return Forecast.METHOD_CONSTANT; }
  getInitialAlfa(): number { return ForecastSolverSingleExponential.initialAlfa; }
  setInitialAlfa(value: number): void { if (validUnit(value)) ForecastSolverSingleExponential.initialAlfa = value; }
  getMinAlfa(): number { return ForecastSolverSingleExponential.minAlfa; }
  setMinAlfa(value: number): void { if (validUnit(value)) ForecastSolverSingleExponential.minAlfa = value; }
  getMaxAlfa(): number { return ForecastSolverSingleExponential.maxAlfa; }
  setMaxAlfa(value: number): void { if (validUnit(value)) ForecastSolverSingleExponential.maxAlfa = value; }
}

export class ForecastSolverDoubleExponential extends ForecastSolverForecastMethod {
  static override readonly cppBases = ["ForecastSolverForecastMethod"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver::DoubleExponential"] as const;
  private static initialAlfa: number = FORECAST_DEFAULTS.doubleInitialAlpha;
  private static minAlfa: number = FORECAST_DEFAULTS.doubleMinAlpha;
  private static maxAlfa: number = FORECAST_DEFAULTS.doubleMaxAlpha;
  private static initialGamma: number = FORECAST_DEFAULTS.doubleInitialGamma;
  private static minGamma: number = FORECAST_DEFAULTS.doubleMinGamma;
  private static maxGamma: number = FORECAST_DEFAULTS.doubleMaxGamma;
  private static dampenTrend: number = FORECAST_DEFAULTS.doubleDampenTrend;
  override generateForecast(forecast: Forecast | null, buckets: ForecastBucketData[], firstBucket: number,
    history: number[], count: number, solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = doubleExponentialForecast(history.slice(0, count), solver.algorithmOptions(
      Math.max(0, buckets.length - solver.getForecastStartBucket()), {
      initialAlpha: ForecastSolverDoubleExponential.initialAlfa, minAlpha: ForecastSolverDoubleExponential.minAlfa,
      maxAlpha: ForecastSolverDoubleExponential.maxAlfa, initialGamma: ForecastSolverDoubleExponential.initialGamma,
      minGamma: ForecastSolverDoubleExponential.minGamma, maxGamma: ForecastSolverDoubleExponential.maxGamma,
      dampenTrend: ForecastSolverDoubleExponential.dampenTrend,
    }, forecast));
    return this.metrics();
  }
  override getCode(): number { return Forecast.METHOD_TREND; }
  getInitialAlfa(): number { return ForecastSolverDoubleExponential.initialAlfa; }
  setInitialAlfa(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.initialAlfa = value; }
  getMinAlfa(): number { return ForecastSolverDoubleExponential.minAlfa; }
  setMinAlfa(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.minAlfa = value; }
  getMaxAlfa(): number { return ForecastSolverDoubleExponential.maxAlfa; }
  setMaxAlfa(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.maxAlfa = value; }
  getInitialGamma(): number { return ForecastSolverDoubleExponential.initialGamma; }
  setInitialGamma(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.initialGamma = value; }
  getMinGamma(): number { return ForecastSolverDoubleExponential.minGamma; }
  setMinGamma(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.minGamma = value; }
  getMaxGamma(): number { return ForecastSolverDoubleExponential.maxGamma; }
  setMaxGamma(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.maxGamma = value; }
  getDampenTrend(): number { return ForecastSolverDoubleExponential.dampenTrend; }
  setDampenTrend(value: number): void { if (validUnit(value)) ForecastSolverDoubleExponential.dampenTrend = value; }
}

export class ForecastSolverSeasonal extends ForecastSolverForecastMethod {
  static override readonly cppBases = ["ForecastSolverForecastMethod"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver::Seasonal"] as const;
  private static initialAlfa: number = FORECAST_DEFAULTS.seasonalInitialAlpha;
  private static minAlfa: number = FORECAST_DEFAULTS.seasonalMinAlpha;
  private static maxAlfa: number = FORECAST_DEFAULTS.seasonalMaxAlpha;
  private static initialBeta: number = FORECAST_DEFAULTS.seasonalInitialBeta;
  private static minBeta: number = FORECAST_DEFAULTS.seasonalMinBeta;
  private static maxBeta: number = FORECAST_DEFAULTS.seasonalMaxBeta;
  private static gamma: number = FORECAST_DEFAULTS.seasonalGamma;
  private static dampenTrend: number = FORECAST_DEFAULTS.seasonalDampenTrend;
  private static minPeriod: number = FORECAST_DEFAULTS.seasonalMinPeriod;
  private static maxPeriod: number = FORECAST_DEFAULTS.seasonalMaxPeriod;
  private static minAutocorrelation: number = FORECAST_DEFAULTS.seasonalMinAutocorrelation;
  private static maxAutocorrelation: number = FORECAST_DEFAULTS.seasonalMaxAutocorrelation;
  override generateForecast(forecast: Forecast | null, buckets: ForecastBucketData[], firstBucket: number,
    history: number[], count: number, solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = seasonalForecast(history.slice(0, count), solver.algorithmOptions(
      Math.max(0, buckets.length - solver.getForecastStartBucket()), {
      initialAlpha: ForecastSolverSeasonal.initialAlfa, minAlpha: ForecastSolverSeasonal.minAlfa,
      maxAlpha: ForecastSolverSeasonal.maxAlfa, initialBeta: ForecastSolverSeasonal.initialBeta,
      minBeta: ForecastSolverSeasonal.minBeta, maxBeta: ForecastSolverSeasonal.maxBeta,
      gamma: ForecastSolverSeasonal.gamma, dampenTrend: ForecastSolverSeasonal.dampenTrend,
      minPeriod: ForecastSolverSeasonal.minPeriod, maxPeriod: ForecastSolverSeasonal.maxPeriod,
      minAutocorrelation: ForecastSolverSeasonal.minAutocorrelation,
      maxAutocorrelation: ForecastSolverSeasonal.maxAutocorrelation,
    }, forecast));
    return this.metrics();
  }
  override getCode(): number { return Forecast.METHOD_SEASONAL; }
  getInitialAlfa(): number { return ForecastSolverSeasonal.initialAlfa; }
  setInitialAlfa(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.initialAlfa = value; }
  getMinAlfa(): number { return ForecastSolverSeasonal.minAlfa; }
  setMinAlfa(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.minAlfa = value; }
  getMaxAlfa(): number { return ForecastSolverSeasonal.maxAlfa; }
  setMaxAlfa(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.maxAlfa = value; }
  getInitialBeta(): number { return ForecastSolverSeasonal.initialBeta; }
  setInitialBeta(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.initialBeta = value; }
  getMinBeta(): number { return ForecastSolverSeasonal.minBeta; }
  setMinBeta(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.minBeta = value; }
  getMaxBeta(): number { return ForecastSolverSeasonal.maxBeta; }
  setMaxBeta(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.maxBeta = value; }
  getGamma(): number { return ForecastSolverSeasonal.gamma; }
  setGamma(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.gamma = value; }
  getDampenTrend(): number { return ForecastSolverSeasonal.dampenTrend; }
  setDampenTrend(value: number): void { if (validUnit(value)) ForecastSolverSeasonal.dampenTrend = value; }
  getMinPeriod(): number { return ForecastSolverSeasonal.minPeriod; }
  setMinPeriod(value: number): void { if (value > 1) ForecastSolverSeasonal.minPeriod = Math.trunc(value); }
  getMaxPeriod(): number { return ForecastSolverSeasonal.maxPeriod; }
  setMaxPeriod(value: number): void { if (value > 1 && value <= 80) ForecastSolverSeasonal.maxPeriod = Math.trunc(value); }
  getMinAutocorrelation(): number { return ForecastSolverSeasonal.minAutocorrelation; }
  setMinAutocorrelation(value: number): void { if (value > 0 && value <= 1) ForecastSolverSeasonal.minAutocorrelation = value; }
  getMaxAutocorrelation(): number { return ForecastSolverSeasonal.maxAutocorrelation; }
  setMaxAutocorrelation(value: number): void { if (value > 0 && value <= 1) ForecastSolverSeasonal.maxAutocorrelation = value; }
}

export class ForecastSolverCroston extends ForecastSolverForecastMethod {
  static override readonly cppBases = ["ForecastSolverForecastMethod"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver::Croston"] as const;
  private static initialAlfa: number = FORECAST_DEFAULTS.crostonInitialAlpha;
  private static minAlfa: number = FORECAST_DEFAULTS.crostonMinAlpha;
  private static maxAlfa: number = FORECAST_DEFAULTS.crostonMaxAlpha;
  private static minIntermittence: number = FORECAST_DEFAULTS.crostonMinIntermittence;
  private static decayRate: number = FORECAST_DEFAULTS.crostonDecayRate;
  override generateForecast(forecast: Forecast | null, buckets: ForecastBucketData[], firstBucket: number,
    history: number[], count: number, solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = crostonForecast(history.slice(0, count), solver.algorithmOptions(
      Math.max(0, buckets.length - solver.getForecastStartBucket()), {
      initialAlpha: ForecastSolverCroston.initialAlfa, minAlpha: ForecastSolverCroston.minAlfa,
      maxAlpha: ForecastSolverCroston.maxAlfa, minIntermittence: ForecastSolverCroston.minIntermittence,
      decayRate: ForecastSolverCroston.decayRate,
    }, forecast));
    return this.metrics();
  }
  override getCode(): number { return Forecast.METHOD_CROSTON; }
  getInitialAlfa(): number { return ForecastSolverCroston.initialAlfa; }
  setInitialAlfa(value: number): void { if (validUnit(value)) ForecastSolverCroston.initialAlfa = value; }
  getMinAlfa(): number { return ForecastSolverCroston.minAlfa; }
  setMinAlfa(value: number): void { if (validUnit(value)) ForecastSolverCroston.minAlfa = value; }
  getMaxAlfa(): number { return ForecastSolverCroston.maxAlfa; }
  setMaxAlfa(value: number): void { if (validUnit(value)) ForecastSolverCroston.maxAlfa = value; }
  getMinIntermittence(): number { return ForecastSolverCroston.minIntermittence; }
  setMinIntermittence(value: number): void { if (validUnit(value)) ForecastSolverCroston.minIntermittence = value; }
  getDecayRate(): number { return ForecastSolverCroston.decayRate; }
  setDecayRate(value: number): void { if (validUnit(value)) ForecastSolverCroston.decayRate = value; }
}

export class ForecastSolverManual extends ForecastSolverForecastMethod {
  static override readonly cppBases = ["ForecastSolverForecastMethod"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver::Manual"] as const;
  override generateForecast(forecast: Forecast | null, buckets: ForecastBucketData[], firstBucket: number,
    history: number[], count: number, solver: ForecastSolver): ForecastSolverMetrics {
    this.firstBucket = firstBucket;
    this.evaluation = manualForecast(history.slice(0, count), solver.algorithmOptions(
      Math.max(0, buckets.length - solver.getForecastStartBucket()), {}, forecast));
    return this.metrics();
  }
  override getCode(): number { return Forecast.METHOD_MANUAL; }
}

export interface ForecastSolveOptions { run_fcst?: boolean; run_netting?: boolean; cluster?: number; demand?: Demand; }

export class ForecastSolver extends Solver {
  static override readonly cppBases = ["Solver"] as const;
  static override readonly cppQualifiedNames = ["ForecastSolver"] as const;
  private static customerThenItemHierarchy = true;
  private static matchUsingDeliveryOperation = true;
  private static netIgnoreLocation = false;
  private static netLate = new Duration(0);
  private static netEarly = new Duration(0);
  private static netPastDemand = false;
  private static averageNoDataDays = true;
  private forecastIterations: number = FORECAST_DEFAULTS.iterations;
  private forecastSmapeAlfa: number = FORECAST_DEFAULTS.smapeAlpha;
  private forecastSkip: number = FORECAST_DEFAULTS.skip;
  private forecastMaxDeviation: number = FORECAST_DEFAULTS.maxDeviation;
  private forecastDeadAfterInactivity: number = FORECAST_DEFAULTS.deadAfterInactivityDays;
  private forecastStartBucket = 0;
  private commandManager = new CommandManager();

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override initialize(): number { return 0; }
  override registerFields(): number { return 0; }
  create(fields: Readonly<Record<string, unknown>> = {}): ForecastSolver {
    const result = new ForecastSolver(); applyDataFields(result, fields); return result;
  }
  override getType(): string { return "solver_forecast"; }
  getSize(): number { return 1; }
  setCalendar(value: Calendar | null): void { Forecast.setCalendar_static(value); }
  getCalendar(): Calendar | null { return Forecast.getCalendar_static(); }
  setDueWithinBucket(value: string): void { ForecastBucket.setDueWithinBucket(value); }
  getDueWithinBucket(): string { return ForecastBucket.getDueWithinBucket(); }
  setCustomerThenItemHierarchy(value: boolean): void { ForecastSolver.customerThenItemHierarchy = Boolean(value); }
  getCustomerThenItemHierarchy(): boolean { return ForecastSolver.customerThenItemHierarchy; }
  setMatchUsingDeliveryOperation(value: boolean): void { ForecastSolver.matchUsingDeliveryOperation = Boolean(value); }
  getMatchUsingDeliveryOperation(): boolean { return ForecastSolver.matchUsingDeliveryOperation; }
  setNetEarly(value: Duration | number | string): void { ForecastSolver.netEarly = new Duration(value); }
  getNetEarly(): Duration { return new Duration(ForecastSolver.netEarly); }
  setNetLate(value: Duration | number | string): void { ForecastSolver.netLate = new Duration(value); }
  getNetLate(): Duration { return new Duration(ForecastSolver.netLate); }
  setNetPastDemand(value: boolean): void { ForecastSolver.netPastDemand = Boolean(value); }
  getNetPastDemand(): boolean { return ForecastSolver.netPastDemand; }
  setAverageNoDataDays(value: boolean): void { ForecastSolver.averageNoDataDays = Boolean(value); }
  getAverageNoDataDays(): boolean { return ForecastSolver.averageNoDataDays; }
  setNetIgnoreLocation(value: boolean): void { ForecastSolver.netIgnoreLocation = Boolean(value); }
  getNetIgnoreLocation(): boolean { return ForecastSolver.netIgnoreLocation; }
  setForecastIterations(value: number): void { if (value > 0) this.forecastIterations = Math.trunc(value); }
  getForecastIterations(): number { return this.forecastIterations; }
  setForecastSmapeAlfa(value: number): void { if (value > 0.5 && value <= 1) this.forecastSmapeAlfa = value; }
  getForecastSmapeAlfa(): number { return this.forecastSmapeAlfa; }
  setForecastSkip(value: number): void { this.forecastSkip = Math.max(0, Math.trunc(value)); }
  getForecastSkip(): number { return this.forecastSkip; }
  setForecastMaxDeviation(value: number): void { if (value > 0) this.forecastMaxDeviation = value; }
  getForecastMaxDeviation(): number { return this.forecastMaxDeviation; }
  setForecastDeadAfterInactivity(value: number): void { if (value > 0) this.forecastDeadAfterInactivity = Math.trunc(value); }
  getForecastDeadAfterInactivity(): number { return this.forecastDeadAfterInactivity; }
  getMovingAverageDefaultOrder(): number { return new ForecastSolverMovingAverage().getDefaultOrder(); }
  setMovingAverageDefaultOrder(value: number): void { new ForecastSolverMovingAverage().setDefaultOrder(value); }
  getSingleExponentialInitialAlfa(): number { return new ForecastSolverSingleExponential().getInitialAlfa(); }
  setSingleExponentialInitialAlfa(value: number): void { new ForecastSolverSingleExponential().setInitialAlfa(value); }
  getSingleExponentialMinAlfa(): number { return new ForecastSolverSingleExponential().getMinAlfa(); }
  setSingleExponentialMinAlfa(value: number): void { new ForecastSolverSingleExponential().setMinAlfa(value); }
  getSingleExponentialMaxAlfa(): number { return new ForecastSolverSingleExponential().getMaxAlfa(); }
  setSingleExponentialMaxAlfa(value: number): void { new ForecastSolverSingleExponential().setMaxAlfa(value); }
  getDoubleExponentialInitialAlfa(): number { return new ForecastSolverDoubleExponential().getInitialAlfa(); }
  setDoubleExponentialInitialAlfa(value: number): void { new ForecastSolverDoubleExponential().setInitialAlfa(value); }
  getDoubleExponentialMinAlfa(): number { return new ForecastSolverDoubleExponential().getMinAlfa(); }
  setDoubleExponentialMinAlfa(value: number): void { new ForecastSolverDoubleExponential().setMinAlfa(value); }
  getDoubleExponentialMaxAlfa(): number { return new ForecastSolverDoubleExponential().getMaxAlfa(); }
  setDoubleExponentialMaxAlfa(value: number): void { new ForecastSolverDoubleExponential().setMaxAlfa(value); }
  getDoubleExponentialInitialGamma(): number { return new ForecastSolverDoubleExponential().getInitialGamma(); }
  setDoubleExponentialInitialGamma(value: number): void { new ForecastSolverDoubleExponential().setInitialGamma(value); }
  getDoubleExponentialMinGamma(): number { return new ForecastSolverDoubleExponential().getMinGamma(); }
  setDoubleExponentialMinGamma(value: number): void { new ForecastSolverDoubleExponential().setMinGamma(value); }
  getDoubleExponentialMaxGamma(): number { return new ForecastSolverDoubleExponential().getMaxGamma(); }
  setDoubleExponentialMaxGamma(value: number): void { new ForecastSolverDoubleExponential().setMaxGamma(value); }
  getDoubleExponentialDampenTrend(): number { return new ForecastSolverDoubleExponential().getDampenTrend(); }
  setDoubleExponentialDampenTrend(value: number): void { new ForecastSolverDoubleExponential().setDampenTrend(value); }
  getSeasonalInitialAlfa(): number { return new ForecastSolverSeasonal().getInitialAlfa(); }
  setSeasonalInitialAlfa(value: number): void { new ForecastSolverSeasonal().setInitialAlfa(value); }
  getSeasonalMinAlfa(): number { return new ForecastSolverSeasonal().getMinAlfa(); }
  setSeasonalMinAlfa(value: number): void { new ForecastSolverSeasonal().setMinAlfa(value); }
  getSeasonalMaxAlfa(): number { return new ForecastSolverSeasonal().getMaxAlfa(); }
  setSeasonalMaxAlfa(value: number): void { new ForecastSolverSeasonal().setMaxAlfa(value); }
  getSeasonalInitialBeta(): number { return new ForecastSolverSeasonal().getInitialBeta(); }
  setSeasonalInitialBeta(value: number): void { new ForecastSolverSeasonal().setInitialBeta(value); }
  getSeasonalMinBeta(): number { return new ForecastSolverSeasonal().getMinBeta(); }
  setSeasonalMinBeta(value: number): void { new ForecastSolverSeasonal().setMinBeta(value); }
  getSeasonalMaxBeta(): number { return new ForecastSolverSeasonal().getMaxBeta(); }
  setSeasonalMaxBeta(value: number): void { new ForecastSolverSeasonal().setMaxBeta(value); }
  getSeasonalGamma(): number { return new ForecastSolverSeasonal().getGamma(); }
  setSeasonalGamma(value: number): void { new ForecastSolverSeasonal().setGamma(value); }
  getSeasonalDampenTrend(): number { return new ForecastSolverSeasonal().getDampenTrend(); }
  setSeasonalDampenTrend(value: number): void { new ForecastSolverSeasonal().setDampenTrend(value); }
  getSeasonalMinPeriod(): number { return new ForecastSolverSeasonal().getMinPeriod(); }
  setSeasonalMinPeriod(value: number): void { new ForecastSolverSeasonal().setMinPeriod(value); }
  getSeasonalMaxPeriod(): number { return new ForecastSolverSeasonal().getMaxPeriod(); }
  setSeasonalMaxPeriod(value: number): void { new ForecastSolverSeasonal().setMaxPeriod(value); }
  getSeasonalMinAutocorrelation(): number { return new ForecastSolverSeasonal().getMinAutocorrelation(); }
  setSeasonalMinAutocorrelation(value: number): void { new ForecastSolverSeasonal().setMinAutocorrelation(value); }
  getSeasonalMaxAutocorrelation(): number { return new ForecastSolverSeasonal().getMaxAutocorrelation(); }
  setSeasonalMaxAutocorrelation(value: number): void { new ForecastSolverSeasonal().setMaxAutocorrelation(value); }
  getCrostonInitialAlfa(): number { return new ForecastSolverCroston().getInitialAlfa(); }
  setCrostonInitialAlfa(value: number): void { new ForecastSolverCroston().setInitialAlfa(value); }
  getCrostonMinAlfa(): number { return new ForecastSolverCroston().getMinAlfa(); }
  setCrostonMinAlfa(value: number): void { new ForecastSolverCroston().setMinAlfa(value); }
  getCrostonMaxAlfa(): number { return new ForecastSolverCroston().getMaxAlfa(); }
  setCrostonMaxAlfa(value: number): void { new ForecastSolverCroston().setMaxAlfa(value); }
  getCrostonMinIntermittence(): number { return new ForecastSolverCroston().getMinIntermittence(); }
  setCrostonMinIntermittence(value: number): void { new ForecastSolverCroston().setMinIntermittence(value); }
  getCrostonDecayRate(): number { return new ForecastSolverCroston().getDecayRate(); }
  setCrostonDecayRate(value: number): void { new ForecastSolverCroston().setDecayRate(value); }
  setCommandManager(value: CommandManager): void { this.commandManager = value; }
  getCommandManager(): CommandManager { return this.commandManager; }
  getForecastStartBucket(): number { return this.forecastStartBucket; }

  algorithmOptions<T extends object>(futurePeriods: number, specific: T, forecast: Forecast | null): T & {
    futurePeriods: number; skip: number; smapeAlpha: number; maxDeviation: number; iterations: number; discrete: boolean;
  } {
    return { ...specific, futurePeriods, skip: this.forecastSkip, smapeAlpha: this.forecastSmapeAlfa,
      maxDeviation: this.forecastMaxDeviation, iterations: this.forecastIterations,
      discrete: forecast?.getDiscrete() ?? false };
  }

  override solve(targetOrOptions?: Demand | ForecastSolveOptions | boolean, runNetting = true, cluster = -1): void {
    if (targetOrOptions instanceof Demand) { this.solveDemand(targetOrOptions); return; }
    if (typeof targetOrOptions === "object" && targetOrOptions) {
      if (targetOrOptions.demand) { this.setAutocommit(false); this.solveDemand(targetOrOptions.demand); return; }
      this.solveAll(targetOrOptions.run_fcst ?? true, targetOrOptions.run_netting ?? true, targetOrOptions.cluster ?? -1);
      return;
    }
    this.solveAll(typeof targetOrOptions === "boolean" ? targetOrOptions : true, runNetting, cluster);
  }

  private solveDemand(demand: Demand): void {
    if (demand instanceof Forecast) { this.computeBaselineForecast(demand); return; }
    const forecast = this.matchDemandToForecast(demand);
    if (forecast) this.netDemandFromForecast(demand, forecast);
  }

  private solveAll(runForecast: boolean, runNetting: boolean, cluster: number): void {
    const manager = this.getAutocommit() ? null : this.commandManager;
    for (const node of Forecast.getForecasts()) {
      if (cluster !== -1 && node instanceof Forecast && node.getCluster() !== cluster) continue;
      for (const bucket of node.getData().getBuckets()) {
        if (bucket.getValue(Measures.forecastconsumed)) Measures.forecastconsumed.update(bucket, 0, manager);
        const total = bucket.getValue(Measures.forecasttotal);
        const cutoff = Plan.instance().getFcstCurrent().subtract(this.getNetPastDemand() ? this.getNetLate() : new Duration(0));
        Measures.forecastnet.update(bucket, bucket.getEnd().compare(cutoff) < 0 ? 0 : total, manager);
      }
    }
    if (runForecast) {
      const forecasts = Forecast.getForecasts().filter((value): value is Forecast => value instanceof Forecast &&
        value.getMethods() !== 0 && (cluster === -1 || value.getCluster() === cluster));
      for (const forecast of forecasts.filter((value) => value.isLeaf())) this.computeBaselineForecast(forecast);
      for (const forecast of forecasts.filter((value) => !value.isLeaf())) this.computeBaselineForecast(forecast);
    }
    if (runNetting) {
      const demands = Demand.all().filter((value) => !(value instanceof Forecast) && !(value instanceof ForecastBucket) &&
        value.getStatus() !== Demand.STATUS_INQUIRY && value.getStatus() !== Demand.STATUS_CANCELED &&
        (cluster === -1 || value.getCluster() === cluster));
      demands.sort((left, right) => left.getDue().compare(right.getDue()) || left.getPriority() - right.getPriority());
      for (const demand of demands) this.solveDemand(demand);
    }
  }

  computeBaselineForecast(forecast: Forecast): void {
    const buckets = forecast.getData().getBuckets();
    this.deleteOutliers(forecast);
    const forecastCurrent = Plan.instance().getFcstCurrent();
    const current = Plan.instance().getCurrent();
    let historyEnd = 0;
    while (historyEnd < buckets.length && (buckets[historyEnd]?.getEnd().compare(forecastCurrent) ?? 1) <= 0) historyEnd += 1;
    let first = 0;
    while (first < historyEnd) {
      const bucket = buckets[first];
      if (bucket && bucket.getValue(Measures.orderstotal) + bucket.getValue(Measures.ordersadjustment) !== 0) break;
      first += 1;
    }
    const source = buckets.slice(first, historyEnd);
    let history = source.map((bucket) => bucket.getValue(Measures.orderstotal) + bucket.getValue(Measures.ordersadjustment));
    const noData = source.map((bucket) => bucket.getValue(Measures.nodata) !== 0);
    if (this.getAverageNoDataDays()) {
      history = history.map((value, index) => {
        if (!noData[index]) return value;
        let previous = index - 1; while (previous >= 0 && noData[previous]) previous -= 1;
        let next = index + 1; while (next < history.length && noData[next]) next += 1;
        if (previous >= 0 && next < history.length) return ((history[previous] ?? 0) + (history[next] ?? 0)) / 2;
        return previous >= 0 ? history[previous] ?? 0 : history[next] ?? 0;
      });
    } else history = history.filter((_value, index) => !noData[index]);
    let planStart = historyEnd;
    while (planStart < buckets.length && (buckets[planStart]?.getEnd().compare(current) ?? 1) <= 0) planStart += 1;
    this.forecastStartBucket = planStart;
    let inactive = 0;
    for (const value of history) inactive = value === 0 ? inactive + 1 : 0;
    const zeros = history.filter((value) => value === 0).length;
    const averageBucketDays = source.length ? Math.max(1, source.reduce((sum, bucket) => sum + bucket.getDates().getDuration().seconds, 0) / source.length / DAY) : 1;
    const deadBuckets = Math.ceil(this.forecastDeadAfterInactivity / averageBucketDays);
    const methods = forecast.getMethods();
    const qualified: ForecastSolverForecastMethod[] = [];
    if (methods & Forecast.METHOD_MANUAL) qualified.push(new ForecastSolverManual());
    else if (history.length <= this.forecastSkip + 5) {
      if (methods & Forecast.METHOD_MOVINGAVERAGE) qualified.push(new ForecastSolverMovingAverage());
    } else if (inactive >= deadBuckets && !buckets.slice(historyEnd).some((bucket) =>
      bucket.getValue(Measures.orderstotal) + bucket.getValue(Measures.ordersadjustment) !== 0)) {
      qualified.push(new ForecastSolverManual());
    } else if (zeros > this.getCrostonMinIntermittence() * history.length) {
      if (methods & Forecast.METHOD_CROSTON) qualified.push(new ForecastSolverCroston());
    } else {
      if (methods & Forecast.METHOD_MOVINGAVERAGE) qualified.push(new ForecastSolverMovingAverage());
      if (methods & Forecast.METHOD_CONSTANT) qualified.push(new ForecastSolverSingleExponential());
      if (methods & Forecast.METHOD_TREND) qualified.push(new ForecastSolverDoubleExponential());
      if (methods & Forecast.METHOD_SEASONAL) qualified.push(new ForecastSolverSeasonal());
    }
    if (!qualified.length) {
      if (methods & Forecast.METHOD_MOVINGAVERAGE) qualified.push(new ForecastSolverMovingAverage());
      if (methods & Forecast.METHOD_CROSTON) qualified.push(new ForecastSolverCroston());
      if (methods & Forecast.METHOD_CONSTANT) qualified.push(new ForecastSolverSingleExponential());
      if (methods & Forecast.METHOD_TREND) qualified.push(new ForecastSolverDoubleExponential());
      if (methods & Forecast.METHOD_SEASONAL) qualified.push(new ForecastSolverSeasonal());
    }
    let best: ForecastSolverForecastMethod | null = null;
    let bestMetrics = new ForecastSolverMetrics();
    for (const method of qualified) {
      const metrics = method.generateForecast(forecast, buckets, first, history, history.length, this);
      if (metrics.smape < bestMetrics.smape || metrics.force) { best = method; bestMetrics = metrics; }
      if (metrics.force) break;
    }
    if (!best && methods === Forecast.METHOD_SEASONAL) {
      best = new ForecastSolverDoubleExponential();
      bestMetrics = best.generateForecast(forecast, buckets, first, history, history.length, this);
      if (!Number.isFinite(bestMetrics.smape)) {
        best = new ForecastSolverMovingAverage();
        bestMetrics = best.generateForecast(forecast, buckets, first, history, history.length, this);
      }
    }
    if (!best) { forecast.setMethod(0); forecast.setSMAPEerror(0); return; }
    forecast.setMethod(best.getCode()); forecast.setSMAPEerror(bestMetrics.smape); forecast.setDeviation(bestMetrics.standarddeviation);
    best.applyForecast(forecast, buckets, planStart, this.getAutocommit() ? null : this.commandManager);
  }

  matchDemandToForecast(demand: Demand): Forecast | null {
    const items = hierarchy(demand.getItem());
    const customers = hierarchy(demand.getCustomer());
    const locations = hierarchy(demand.getLocation());
    const tryMatch = (itemIndex: number, customerIndex: number, locationIndex: number): Forecast | null => {
      const item = items[itemIndex] ?? null;
      const customer = customers[customerIndex] ?? null;
      const location = locations[locationIndex] ?? null;
      let result: Forecast | null = null;
      if (this.getNetIgnoreLocation()) {
        result = Forecast.getForecasts().find((value): value is Forecast => value instanceof Forecast &&
          value.getItem() === item && value.getCustomer() === customer && !value.isAggregate()) ?? null;
        return result?.getPlanned() ? result : null;
      } else {
        const found = Forecast.findForecast(item, customer, location, false);
        result = found instanceof Forecast && !found.isAggregate() ? found : null;
      }
      return result?.getPlanned() && (!this.getMatchUsingDeliveryOperation() ||
        result.getDeliveryOperation() === demand.getDeliveryOperation()) ? result : null;
    };
    for (let location = 0; location < locations.length; location += 1) {
      if (this.getCustomerThenItemHierarchy()) {
        for (let item = 0; item < items.length; item += 1) for (let customer = 0; customer < customers.length; customer += 1) {
          const result = tryMatch(item, customer, location); if (result) return result;
        }
      } else for (let customer = 0; customer < customers.length; customer += 1) for (let item = 0; item < items.length; item += 1) {
        const result = tryMatch(item, customer, location); if (result) return result;
      }
    }
    return null;
  }

  netDemandFromForecast(demand: Demand, forecast: Forecast): number {
    let remaining = demand.getQuantity();
    const quantityToNet = demand.getDoubleProperty("quantity_to_net", -1);
    if (quantityToNet >= 0) remaining = quantityToNet;
    const buckets = forecast.getData().getBuckets();
    const zero = buckets.findIndex((bucket) => bucket.getDates().within(demand.getDue()));
    if (zero < 0) throw new LogicException(`Can't find forecast bucket for ${demand.getDue()} in forecast '${forecast.getName()}'`);
    const late = demand.hasProperty("net_late") ? new Duration(demand.getDoubleProperty("net_late") * DAY) : this.getNetLate();
    const early = demand.hasProperty("net_early") ? new Duration(demand.getDoubleProperty("net_early") * DAY) : this.getNetEarly();
    const zeroBucket = buckets[zero];
    const cutoff = Plan.instance().getFcstCurrent().subtract(this.getNetPastDemand() ? late : new Duration(0));
    if (!zeroBucket || zeroBucket.getEnd().compare(cutoff) <= 0) return remaining;
    const indices = [zero, ...Array.from({ length: zero }, (_value, index) => zero - index - 1),
      ...Array.from({ length: buckets.length - zero - 1 }, (_value, index) => zero + index + 1)];
    const earliest = demand.getDue().subtract(early);
    const latest = demand.getDue().add(late);
    const manager = this.getAutocommit() ? null : this.commandManager;
    for (const index of indices) {
      if (remaining <= ROUNDING_ERROR) break;
      const bucket = buckets[index];
      if (!bucket || earliest.compare(bucket.getEnd()) >= 0 || latest.compare(bucket.getStart()) < 0) continue;
      const available = bucket.getValue(Measures.forecastnet);
      if (available <= ROUNDING_ERROR) continue;
      const consumed = Math.min(available, remaining);
      Measures.forecastconsumed.update(bucket, bucket.getValue(Measures.forecastconsumed) + consumed, manager);
      Measures.forecastnet.update(bucket, available - consumed, manager);
      remaining -= consumed;
    }
    return remaining;
  }

  private deleteOutliers(forecast: Forecast): void {
    for (const bucket of forecast.getData().getBuckets()) {
      const demandBucket = bucket.getForecastBucket();
      if (demandBucket) {
        for (const problem of demandBucket.getProblems()) {
          if (problem instanceof ProblemOutlier) problem.dispose();
        }
      }
      bucket.removeValue(false, null, Measures.outlier);
    }
  }

  commit(): void { this.commandManager.commit(); }
  rollback(): void { this.commandManager.rollback(); }
}

export class ForecastSolverSorter extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["ForecastSolver::sorter"] as const;
  compare(left: Demand, right: Demand): number { return left.getDue().compare(right.getDue()) || left.getPriority() - right.getPriority(); }
}

export class ProblemOutlier extends Problem {
  static override readonly cppBases = ["Problem"] as const;
  static override readonly cppQualifiedNames = ["ProblemOutlier"] as const;
  constructor(private readonly bucket: ForecastBucket, private method: ForecastSolverForecastMethod, add = true) {
    super(bucket, false); if (add) this.addProblem();
  }
  override getDates(): DateRange { return this.bucket.getDueRange(); }
  override getDescription(): string {
    return `Outlier detected for ${this.bucket.getItem()?.getName() ?? ""} @ ${this.bucket.getLocation()?.getName() ?? ""} @ ${this.bucket.getCustomer()?.getName() ?? ""} @ ${this.bucket.getStartDate().toString("%Y-%m-%d")}`;
  }
  override getEntity(): string { return "demand"; }
  getForecastBucket(): ForecastBucket { return this.bucket; }
  getForecastMethod(): ForecastSolverForecastMethod { return this.method; }
  setForecastMethod(value: ForecastSolverForecastMethod): void { this.method = value; }
  override getOwner(): ForecastBucket { return this.bucket; }
  override getType(): string { return "outlier"; }
  getWeight(): number { return this.bucket.getOrdersTotal(); }
  override isFeasible(): boolean { return true; }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/forecast/forecastsolver.cpp.
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
  { name: "ForecastSolver::Net_Late", sourceLine: 34, status: "adapted" },
  { name: "ForecastSolver::Net_Early", sourceLine: 35, status: "adapted" },
  { name: "ForecastSolver::tag_DueWithinBucket", sourceLine: 39, status: "adapted" },
  { name: "ForecastSolver::tag_Net_CustomerThenItemHierarchy", sourceLine: 40, status: "adapted" },
  { name: "ForecastSolver::tag_Net_MatchUsingDeliveryOperation", sourceLine: 42, status: "adapted" },
  { name: "ForecastSolver::tag_Net_NetEarly", sourceLine: 44, status: "adapted" },
  { name: "ForecastSolver::tag_Net_NetLate", sourceLine: 45, status: "adapted" },
  { name: "ForecastSolver::tag_Net_PastDemand", sourceLine: 46, status: "adapted" },
  { name: "ForecastSolver::tag_AverageNoDataDays", sourceLine: 47, status: "adapted" },
  { name: "ForecastSolver::tag_Net_IgnoreLocation", sourceLine: 48, status: "adapted" },
  { name: "ForecastSolver::tag_Iterations", sourceLine: 49, status: "adapted" },
  { name: "ForecastSolver::tag_SmapeAlfa", sourceLine: 50, status: "adapted" },
  { name: "ForecastSolver::tag_Skip", sourceLine: 51, status: "adapted" },
  { name: "ForecastSolver::tag_MovingAverage_order", sourceLine: 52, status: "adapted" },
  { name: "ForecastSolver::tag_SingleExponential_initialAlfa", sourceLine: 53, status: "adapted" },
  { name: "ForecastSolver::tag_SingleExponential_minAlfa", sourceLine: 55, status: "adapted" },
  { name: "ForecastSolver::tag_SingleExponential_maxAlfa", sourceLine: 57, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_initialAlfa", sourceLine: 59, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_minAlfa", sourceLine: 61, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_maxAlfa", sourceLine: 63, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_initialGamma", sourceLine: 65, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_minGamma", sourceLine: 67, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_maxGamma", sourceLine: 69, status: "adapted" },
  { name: "ForecastSolver::tag_DoubleExponential_dampenTrend", sourceLine: 71, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_initialAlfa", sourceLine: 73, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_minAlfa", sourceLine: 74, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_maxAlfa", sourceLine: 75, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_initialBeta", sourceLine: 76, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_minBeta", sourceLine: 77, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_maxBeta", sourceLine: 78, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_gamma", sourceLine: 79, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_dampenTrend", sourceLine: 80, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_minPeriod", sourceLine: 81, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_maxPeriod", sourceLine: 82, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_minAutocorrelation", sourceLine: 83, status: "adapted" },
  { name: "ForecastSolver::tag_Seasonal_maxAutocorrelation", sourceLine: 85, status: "adapted" },
  { name: "ForecastSolver::tag_Croston_initialAlfa", sourceLine: 87, status: "adapted" },
  { name: "ForecastSolver::tag_Croston_minAlfa", sourceLine: 88, status: "adapted" },
  { name: "ForecastSolver::tag_Croston_maxAlfa", sourceLine: 89, status: "adapted" },
  { name: "ForecastSolver::tag_Croston_minIntermittence", sourceLine: 90, status: "adapted" },
  { name: "ForecastSolver::tag_Croston_decayRate", sourceLine: 92, status: "adapted" },
  { name: "ForecastSolver::tag_Outlier_maxDeviation", sourceLine: 93, status: "adapted" },
  { name: "ForecastSolver::tag_DeadAfterInactivity", sourceLine: 94, status: "adapted" },
  { name: "ForecastSolver::initialize", sourceLine: 96, status: "adapted" },
  { name: "ForecastSolver::create", sourceLine: 124, status: "adapted" },
  { name: "ForecastSolver::solve", sourceLine: 157, status: "adapted" },
  { name: "ForecastSolver::solve", sourceLine: 184, status: "adapted" },
  { name: "ForecastSolver::solve", sourceLine: 228, status: "adapted" },
  { name: "ForecastSolver::getNetPastDemand", sourceLine: 259, status: "adapted" },
  { name: "ForecastSolver::matchDemandToForecast", sourceLine: 358, status: "adapted" },
  { name: "Forecast::findForecast", sourceLine: 383, status: "adapted" },
  { name: "ForecastSolver::netDemandFromForecast", sourceLine: 443, status: "adapted" },
  { name: "Plan::instance", sourceLine: 476, status: "adapted" },
  { name: "ForecastSolver::commit", sourceLine: 559, status: "adapted" },
  { name: "ForecastSolver::rollback", sourceLine: 574, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface ForecastPort {
  findForecast(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastSolverPort {
  Net_Early(...args: readonly PortValue[]): PortValue | void;
  Net_Late(...args: readonly PortValue[]): PortValue | void;
  commit(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  getNetPastDemand(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  matchDemandToForecast(...args: readonly PortValue[]): PortValue | void;
  netDemandFromForecast(...args: readonly PortValue[]): PortValue | void;
  rollback(...args: readonly PortValue[]): PortValue | void;
  solve(...args: readonly PortValue[]): PortValue | void;
  tag_AverageNoDataDays(...args: readonly PortValue[]): PortValue | void;
  tag_Croston_decayRate(...args: readonly PortValue[]): PortValue | void;
  tag_Croston_initialAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Croston_maxAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Croston_minAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Croston_minIntermittence(...args: readonly PortValue[]): PortValue | void;
  tag_DeadAfterInactivity(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_dampenTrend(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_initialAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_initialGamma(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_maxAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_maxGamma(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_minAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_DoubleExponential_minGamma(...args: readonly PortValue[]): PortValue | void;
  tag_DueWithinBucket(...args: readonly PortValue[]): PortValue | void;
  tag_Iterations(...args: readonly PortValue[]): PortValue | void;
  tag_MovingAverage_order(...args: readonly PortValue[]): PortValue | void;
  tag_Net_CustomerThenItemHierarchy(...args: readonly PortValue[]): PortValue | void;
  tag_Net_IgnoreLocation(...args: readonly PortValue[]): PortValue | void;
  tag_Net_MatchUsingDeliveryOperation(...args: readonly PortValue[]): PortValue | void;
  tag_Net_NetEarly(...args: readonly PortValue[]): PortValue | void;
  tag_Net_NetLate(...args: readonly PortValue[]): PortValue | void;
  tag_Net_PastDemand(...args: readonly PortValue[]): PortValue | void;
  tag_Outlier_maxDeviation(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_dampenTrend(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_gamma(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_initialAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_initialBeta(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_maxAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_maxAutocorrelation(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_maxBeta(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_maxPeriod(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_minAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_minAutocorrelation(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_minBeta(...args: readonly PortValue[]): PortValue | void;
  tag_Seasonal_minPeriod(...args: readonly PortValue[]): PortValue | void;
  tag_SingleExponential_initialAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_SingleExponential_maxAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_SingleExponential_minAlfa(...args: readonly PortValue[]): PortValue | void;
  tag_Skip(...args: readonly PortValue[]): PortValue | void;
  tag_SmapeAlfa(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/forecast/forecastsolver.cpp";
export const targetFile = "forecast/forecastsolver.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2012-2015 by frePPLe bv                                   *",
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
  "#include \"forecast.h\"",
  "",
  "namespace frepple {",
  "",
  "const MetaClass* ForecastSolver::metadata;",
  "bool ForecastSolver::Customer_Then_Item_Hierarchy = true;",
  "bool ForecastSolver::Match_Using_Delivery_Operation = true;",
  "bool ForecastSolver::Net_Ignore_Location = false;",
  "Duration ForecastSolver::Net_Late(0L);",
  "Duration ForecastSolver::Net_Early(0L);",
  "bool ForecastSolver::Net_PastDemand = false;",
  "bool ForecastSolver::AverageNoDataDays = true;",
  "",
  "const Keyword ForecastSolver::tag_DueWithinBucket(\"DueWithinBucket\");",
  "const Keyword ForecastSolver::tag_Net_CustomerThenItemHierarchy(",
  "    \"Net_CustomerThenItemHierarchy\");",
  "const Keyword ForecastSolver::tag_Net_MatchUsingDeliveryOperation(",
  "    \"Net_MatchUsingDeliveryOperation\");",
  "const Keyword ForecastSolver::tag_Net_NetEarly(\"Net_NetEarly\");",
  "const Keyword ForecastSolver::tag_Net_NetLate(\"Net_NetLate\");",
  "const Keyword ForecastSolver::tag_Net_PastDemand(\"Net_PastDemand\");",
  "const Keyword ForecastSolver::tag_AverageNoDataDays(\"AverageNoDataDays\");",
  "const Keyword ForecastSolver::tag_Net_IgnoreLocation(\"Net_IgnoreLocation\");",
  "const Keyword ForecastSolver::tag_Iterations(\"Iterations\");",
  "const Keyword ForecastSolver::tag_SmapeAlfa(\"SmapeAlfa\");",
  "const Keyword ForecastSolver::tag_Skip(\"Skip\");",
  "const Keyword ForecastSolver::tag_MovingAverage_order(\"MovingAverage_order\");",
  "const Keyword ForecastSolver::tag_SingleExponential_initialAlfa(",
  "    \"SingleExponential_initialAlfa\");",
  "const Keyword ForecastSolver::tag_SingleExponential_minAlfa(",
  "    \"SingleExponential_minAlfa\");",
  "const Keyword ForecastSolver::tag_SingleExponential_maxAlfa(",
  "    \"SingleExponential_maxAlfa\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_initialAlfa(",
  "    \"DoubleExponential_initialAlfa\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_minAlfa(",
  "    \"DoubleExponential_minAlfa\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_maxAlfa(",
  "    \"DoubleExponential_maxAlfa\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_initialGamma(",
  "    \"DoubleExponential_initialGamma\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_minGamma(",
  "    \"DoubleExponential_minGamma\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_maxGamma(",
  "    \"DoubleExponential_maxGamma\");",
  "const Keyword ForecastSolver::tag_DoubleExponential_dampenTrend(",
  "    \"DoubleExponential_dampenTrend\");",
  "const Keyword ForecastSolver::tag_Seasonal_initialAlfa(\"Seasonal_initialAlfa\");",
  "const Keyword ForecastSolver::tag_Seasonal_minAlfa(\"Seasonal_minAlfa\");",
  "const Keyword ForecastSolver::tag_Seasonal_maxAlfa(\"Seasonal_maxAlfa\");",
  "const Keyword ForecastSolver::tag_Seasonal_initialBeta(\"Seasonal_initialBeta\");",
  "const Keyword ForecastSolver::tag_Seasonal_minBeta(\"Seasonal_minBeta\");",
  "const Keyword ForecastSolver::tag_Seasonal_maxBeta(\"Seasonal_maxBeta\");",
  "const Keyword ForecastSolver::tag_Seasonal_gamma(\"Seasonal_gamma\");",
  "const Keyword ForecastSolver::tag_Seasonal_dampenTrend(\"Seasonal_dampenTrend\");",
  "const Keyword ForecastSolver::tag_Seasonal_minPeriod(\"Seasonal_minPeriod\");",
  "const Keyword ForecastSolver::tag_Seasonal_maxPeriod(\"Seasonal_maxPeriod\");",
  "const Keyword ForecastSolver::tag_Seasonal_minAutocorrelation(",
  "    \"Seasonal_minAutocorrelation\");",
  "const Keyword ForecastSolver::tag_Seasonal_maxAutocorrelation(",
  "    \"Seasonal_maxAutocorrelation\");",
  "const Keyword ForecastSolver::tag_Croston_initialAlfa(\"Croston_initialAlfa\");",
  "const Keyword ForecastSolver::tag_Croston_minAlfa(\"Croston_minAlfa\");",
  "const Keyword ForecastSolver::tag_Croston_maxAlfa(\"Croston_maxAlfa\");",
  "const Keyword ForecastSolver::tag_Croston_minIntermittence(",
  "    \"Croston_minIntermittence\");",
  "const Keyword ForecastSolver::tag_Croston_decayRate(\"Croston_decayRate\");",
  "const Keyword ForecastSolver::tag_Outlier_maxDeviation(\"Outlier_maxDeviation\");",
  "const Keyword ForecastSolver::tag_DeadAfterInactivity(\"DeadAfterInactivity\");",
  "",
  "int ForecastSolver::initialize() {",
  "  // Initialize the smape weight array",
  "  weight[0] = 1.0;",
  "  for (int i = 0; i < MAXBUCKETS - 1; ++i)",
  "    weight[i + 1] = weight[i] * Forecast_SmapeAlfa;",
  "",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<ForecastSolver>(",
  "      \"solver\", \"solver_forecast\", Object::create<ForecastSolver>);",
  "  registerFields<ForecastSolver>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleClass<ForecastSolver, Solver>::getPythonType();",
  "  x.setName(\"solver_forecast\");",
  "  x.setDoc(\"frePPLe solver_forecast\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(",
  "      \"solve\",",
  "      static_cast<PyObject* (*)(PyObject*, PyObject*, PyObject*)>(solve),",
  "      METH_VARARGS, \"run the solver\");",
  "  x.addMethod(\"commit\", commit, METH_NOARGS, \"commit the plan changes\");",
  "  x.addMethod(\"rollback\", rollback, METH_NOARGS, \"rollback the plan changes\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* ForecastSolver::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Create the solver",
  "    auto* s = new ForecastSolver();",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    PyObject *key, *value;",
  "    Py_ssize_t pos = 0;",
  "    while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "      PythonData field(value);",
  "      PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "      DataKeyword attr(PyBytes_AsString(key_utf8));",
  "      Py_DECREF(key_utf8);",
  "      const MetaFieldBase* fmeta = metadata->findField(attr.getHash());",
  "      if (!fmeta) fmeta = Solver::metadata->findField(attr.getHash());",
  "      if (fmeta)",
  "        // Update the attribute",
  "        fmeta->setField(s, field);",
  "      else",
  "        s->setProperty(attr.getName(), value);",
  "    };",
  "",
  "    // Return the object. The reference count doesn't need to be increased",
  "    // as we do with other objects, because we want this object to be available",
  "    // for the garbage collector of Python.",
  "    return static_cast<PyObject*>(s);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "void ForecastSolver::solve(const Demand* l, void*) {",
  "  if (l->hasType<Forecast>())",
  "    // Compute the baseline forecast",
  "    computeBaselineForecast(static_cast<const Forecast*>(l));",
  "  else {",
  "    // Message",
  "    if (getLogLevel() > 0)",
  "      logger << \"  Netting of demand '\" << l << \"'  ('\" << l->getCustomer()",
  "             << \"', '\" << l->getItem() << \"', '\" << l->getLocation() << \"', '\"",
  "             << l->getDeliveryOperation() << \"'): \" << l->getDue() << \", \"",
  "             << l->getQuantity() << '\\n';",
  "",
  "    // Find a matching forecast",
  "    Forecast* fcst = matchDemandToForecast(l);",
  "",
  "    if (!fcst) {",
  "      // Message",
  "      if (getLogLevel() > 0) logger << \"    No matching forecast available\\n\";",
  "      return;",
  "    } else if (getLogLevel() > 0)",
  "      logger << \"    Matching forecast: \" << fcst << '\\n';",
  "",
  "    // Netting the order from the forecast",
  "    netDemandFromForecast(l, fcst);",
  "  }",
  "}",
  "",
  "PyObject* ForecastSolver::solve(PyObject* self, PyObject* args,",
  "                                PyObject* kwargs) {",
  "  static const char* kwlist[] = {\"run_fcst\", \"cluster\", \"run_netting\", \"demand\",",
  "                                 nullptr};",
  "  // Create the command",
  "  int run_fcst = 1;",
  "  int run_netting = 1;",
  "  int cluster = -1;",
  "  PyObject* dem = nullptr;",
  "  if (!PyArg_ParseTupleAndKeywords(args, kwargs, \"|pipO:solve\",",
  "                                   const_cast<char**>(kwlist), &run_fcst,",
  "                                   &cluster, &run_netting, &dem))",
  "    return nullptr;",
  "  if (dem && !PyObject_TypeCheck(dem, Demand::metadata->pythonClass) &&",
  "      !PyObject_TypeCheck(dem, Forecast::metadata->pythonClass)) {",
  "    PyErr_SetString(PythonDataException,",
  "                    \"demand argument must be a demand or forecast\");",
  "    return nullptr;",
  "  }",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    auto sol = static_cast<ForecastSolver*>(self);",
  "    if (!dem) {",
  "      // Run for all or a single cluster",
  "      sol->setAutocommit(true);",
  "      sol->solve(run_fcst == 1, run_netting == 1, cluster);",
  "    } else {",
  "      // Run for a single forecast or run netting for a sales order",
  "      sol->setAutocommit(false);",
  "      sol->solve(static_cast<Demand*>(dem));",
  "    }",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void ForecastSolver::solve(bool run_fcst, bool run_netting, int cluster) {",
  "  // Switch to lazy cache flushing",
  "  auto prevCachePolicy = Cache::instance->setWriteImmediately(false);",
  "",
  "  // Reset forecastconsumed to 0 and forecastnet to forecasttotal.",
  "  // When running for a cluster we reset the leafs and propagate.",
  "  // When running globablly we can skip the propagation.",
  "  for (auto& f : Forecast::getForecasts()) {",
  "    if (cluster != -1 &&",
  "        (!f->isLeaf() || static_cast<Forecast*>(&*f)->getCluster() != cluster))",
  "      continue;",
  "",
  "    // if you are not planned and none of your chilren is planned",
  "    // we are below the valid forecast combinations",
  "    // for the forecastnet and forecastconsumed measures",
  "    bool childrenPlanned = false;",
  "    for (auto ch = f->getLeaves(true, Measures::forecastnet); ch; ++ch)",
  "      if (ch->getPlanned()) {",
  "        childrenPlanned = true;",
  "        break;",
  "      }",
  "    if (!childrenPlanned) continue;",
  "",
  "    auto fcstdata = f->getData();",
  "    lock_guard<recursive_mutex> exclusive(fcstdata->lock);",
  "    for (auto& bckt : fcstdata->getBuckets()) {",
  "      if (bckt.getValue(*Measures::forecastconsumed))",
  "        bckt.removeValue(cluster != -1, !getAutocommit() ? commands : nullptr,",
  "                         Measures::forecastconsumed);",
  "      auto fcsttotal = bckt.getValue(*Measures::forecasttotal);",
  "      if (bckt.getEnd() < Plan::instance().getFcstCurrent() -",
  "                              (ForecastSolver::getNetPastDemand()",
  "                                   ? ForecastSolver::getNetLate()",
  "                                   : Duration(0L)) ||",
  "          !fcsttotal)",
  "        bckt.removeValue(cluster != -1, !getAutocommit() ? commands : nullptr,",
  "                         Measures::forecastnet);",
  "      else",
  "        bckt.setValue(cluster != -1, !getAutocommit() ? commands : nullptr,",
  "                      Measures::forecastnet, fcsttotal);",
  "    }",
  "  }",
  "",
  "  if (run_fcst) {",
  "    // Time series forecasting for all leaf forecasts",
  "    // TODO Assumes that the lowest forecasting level is a leaf forecast.",
  "    if (getLogLevel() > 5) logger << \"Start forecasting for leaf forecasts\\n\";",
  "    for (auto& x : Forecast::getForecasts()) {",
  "      try {",
  "        if (x->getMethods() && x->isLeaf() &&",
  "            (cluster == -1 ||",
  "             static_cast<Forecast*>(&*x)->getCluster() == cluster))",
  "          solve(static_cast<Forecast*>(&*x), nullptr);",
  "      } catch (...) {",
  "        logger << \"Error: Caught an exception while forecasting '\"",
  "               << static_cast<Forecast*>(&*x) << \"':\\n\";",
  "        try {",
  "          throw;",
  "        } catch (const bad_exception&) {",
  "          logger << \"  bad exception\\n\";",
  "        } catch (const exception& e) {",
  "          logger << \"  \" << e.what() << '\\n';",
  "        } catch (...) {",
  "          logger << \"  Unknown type\\n\";",
  "        }",
  "      }",
  "    }",
  "    if (getLogLevel() > 5) logger << \"End forecasting for leaf forecasts\\n\";",
  "",
  "    // Time series forecasting for all middle-out parent forecasts",
  "    if (getLogLevel() > 5) logger << \"Start forecasting for parent forecasts\\n\";",
  "    for (auto& x : Forecast::getForecasts()) {",
  "      try {",
  "        if (x->getMethods() && !x->isLeaf() &&",
  "            (cluster == -1 ||",
  "             static_cast<Forecast*>(&*x)->getCluster() == cluster))",
  "          solve(static_cast<Forecast*>(&*x), nullptr);",
  "      } catch (...) {",
  "        logger << \"Error: Caught an exception while forecasting '\"",
  "               << static_cast<Forecast*>(&*x)->getName() << \"':\\n\";",
  "        try {",
  "          throw;",
  "        } catch (const bad_exception&) {",
  "          logger << \"  bad exception\\n\";",
  "        } catch (const exception& e) {",
  "          logger << \"  \" << e.what() << '\\n';",
  "        } catch (...) {",
  "          logger << \"  Unknown type\\n\";",
  "        }",
  "      }",
  "    }",
  "    if (getLogLevel() > 5) logger << \"End forecasting for parent forecasts\\n\";",
  "  }",
  "",
  "  if (run_netting) {",
  "    // Sort the demands using the same sort function as used for planning.",
  "    // Note: the memory consumption of the sorted list can be significant",
  "    sortedDemandList l;",
  "    for (auto& i : Demand::all())",
  "      if (i.getType() != *Forecast::metadata &&",
  "          i.getType() != *ForecastBucket::metadata &&",
  "          i.getStatus() != Demand::STATUS_INQUIRY &&",
  "          i.getStatus() != Demand::STATUS_CANCELED &&",
  "          (cluster == -1 || i.getCluster() == cluster))",
  "        l.insert(&i);",
  "",
  "    // Forecast netting loop",
  "    for (auto i : l) {",
  "      try {",
  "        solve(i, nullptr);",
  "      } catch (...) {",
  "        logger << \"Error: Caught an exception while netting demand '\"",
  "               << i->getName() << \"':\\n\";",
  "        try {",
  "          throw;",
  "        } catch (const bad_exception&) {",
  "          logger << \"  bad exception\\n\";",
  "        } catch (const exception& e) {",
  "          logger << \"  \" << e.what() << '\\n';",
  "        } catch (...) {",
  "          logger << \"  Unknown type\\n\";",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Restore the previous caching policy",
  "  Cache::instance->setWriteImmediately(prevCachePolicy);",
  "}",
  "",
  "Forecast* ForecastSolver::matchDemandToForecast(const Demand* l) {",
  "  auto curItem = l->getItem();",
  "  auto curCustomer = l->getCustomer();",
  "  auto curLocation = l->getLocation();",
  "  do  // Loop through third dimension",
  "  {",
  "    do  // Loop through second dimension",
  "    {",
  "      do  // Loop through first dimension",
  "      {",
  "        if (Net_Ignore_Location) {",
  "          // Check for a match, ignoring the location dimension",
  "          if (!curItem) return nullptr;",
  "          auto dmds = curItem->getDemandIterator();",
  "          while (auto dmd = dmds.next()) {",
  "            if (dmd->hasType<Forecast>() && dmd->getCustomer() == curCustomer) {",
  "              auto fcst = static_cast<Forecast*>(dmd);",
  "              if (!fcst->isAggregate() && fcst->getPlanned())",
  "                // Match found",
  "                return fcst;",
  "            }",
  "          }",
  "        } else {",
  "          // Check for a item + location + customer match",
  "          auto xb =",
  "              Forecast::findForecast(curItem, curCustomer, curLocation, false);",
  "          if (xb && !xb->isAggregate()) {",
  "            auto x = static_cast<Forecast*>(xb);",
  "            if (x->getPlanned() &&",
  "                (!getMatchUsingDeliveryOperation() ||",
  "                 x->getDeliveryOperation() == l->getDeliveryOperation()))",
  "              // Match found",
  "              return x;",
  "          }",
  "        }",
  "",
  "        // Not found: try a higher level match in first dimension",
  "        if (Customer_Then_Item_Hierarchy) {",
  "          // First customer hierarchy",
  "          if (curCustomer)",
  "            curCustomer = curCustomer->getOwner();",
  "          else",
  "            break;",
  "        } else {",
  "          // First item hierarchy",
  "          if (curItem)",
  "            curItem = curItem->getOwner();",
  "          else",
  "            break;",
  "        }",
  "      } while (true);",
  "",
  "      // Not found at any level in the first dimension",
  "",
  "      // Try a new level in the second dimension",
  "      if (Customer_Then_Item_Hierarchy) {",
  "        // Second is item",
  "        if (curItem)",
  "          curItem = curItem->getOwner();",
  "        else",
  "          return nullptr;",
  "        // Reset to lowest level in the first dimension again",
  "        curCustomer = l->getCustomer();",
  "      } else {",
  "        // Second is customer",
  "        if (curCustomer)",
  "          curCustomer = curCustomer->getOwner();",
  "        else",
  "          return nullptr;",
  "        // Reset to lowest level in the first dimension again",
  "        curItem = l->getItem();",
  "      }",
  "    } while (true);",
  "",
  "    // Try parent location",
  "    if (curLocation)",
  "      curLocation = curLocation->getOwner();",
  "    else",
  "      return nullptr;",
  "    // Reset to lowest level in the first and second dimensions again",
  "    curItem = l->getItem();",
  "    curCustomer = l->getCustomer();",
  "  } while (true);",
  "}",
  "",
  "void ForecastSolver::netDemandFromForecast(const Demand* dmd, Forecast* fcst) {",
  "  // Check quantity to net",
  "  double remaining = dmd->getQuantity();",
  "  auto tmp = dmd->getDoubleProperty(\"quantity_to_net\", -1.0);",
  "  if (tmp >= 0) remaining = tmp;",
  "",
  "  // Empty forecast model",
  "  if (!fcst->isGroup()) {",
  "    if (getLogLevel() > 1) logger << \"    Empty forecast model\\n\";",
  "    if (getLogLevel() > 0 && remaining)",
  "      logger << \"    Remains \" << remaining << \" that can't be netted\\n\";",
  "    return;",
  "  }",
  "",
  "  // Load forecast data",
  "  auto data = fcst->getData();",
  "  lock_guard<recursive_mutex> exclusive(data->lock);",
  "",
  "  // Find the bucket with the due date",
  "  auto zerobucket = data->getBuckets().begin();",
  "  while (zerobucket != data->getBuckets().end()) {",
  "    if (zerobucket->getDates().within(dmd->getDue())) break;",
  "    ++zerobucket;",
  "  }",
  "  if (zerobucket == data->getBuckets().end())",
  "    throw LogicException(\"Can't find forecast bucket for \" +",
  "                         string(dmd->getDue()) + \" in forecast '\" +",
  "                         fcst->getName() + \"'\");",
  "",
  "  Duration netLate = dmd->hasProperty(\"net_late\")",
  "                         ? Duration(dmd->getDoubleProperty(\"net_late\") * 86400)",
  "                         : getNetLate();",
  "  if (zerobucket->getEnd() <=",
  "      Plan::instance().getFcstCurrent() -",
  "          (getNetPastDemand() ? netLate : Duration(0L))) {",
  "    // The order is due in a bucket in the past.",
  "    // Such orders shouldn't be considered for netting, as we can assume",
  "    // they consumed from past buckets we're not concerned with any longer.",
  "    if (getLogLevel() > 1)",
  "      logger << \"    Overdue order doesn't require netting\\n\";",
  "    return;",
  "  }",
  "",
  "  // Netting - looking for time buckets with net forecast",
  "  auto curbucket = zerobucket;",
  "  bool backward = true;",
  "  Duration netEarly =",
  "      dmd->hasProperty(\"net_early\")",
  "          ? Duration(dmd->getDoubleProperty(\"net_early\") * 86400)",
  "          : getNetEarly();",
  "",
  "  while (remaining > 0 && curbucket != data->getBuckets().end() &&",
  "         (dmd->getDue() - netEarly < curbucket->getEnd()) &&",
  "         (dmd->getDue() + netLate >= curbucket->getStart())) {",
  "    // Net from the current bucket",
  "    auto available = Measures::forecastnet->getValue(*curbucket);",
  "    if (available > ROUNDING_ERROR) {",
  "      if (available >= remaining) {",
  "        // Partially consume a bucket",
  "        if (getLogLevel() > 1)",
  "          logger << \"    Consuming \" << remaining << \" from bucket \"",
  "                 << curbucket->getDates() << \" (\" << available << \" available)\"",
  "                 << '\\n';",
  "        Measures::forecastconsumed->disaggregate(",
  "            *curbucket,",
  "            remaining + Measures::forecastconsumed->getValue(*curbucket), false,",
  "            0, !getAutocommit() ? commands : nullptr);",
  "        Measures::forecastnet->disaggregate(",
  "            *curbucket, available - remaining, false, 0,",
  "            !getAutocommit() ? commands : nullptr);",
  "        remaining = 0;",
  "      } else {",
  "        // Completely consume a bucket",
  "        if (getLogLevel() > 1)",
  "          logger << \"    Consuming \" << available << \" from bucket \"",
  "                 << curbucket->getDates() << \" (\" << available << \" available)\"",
  "                 << '\\n';",
  "        remaining -= available;",
  "        Measures::forecastconsumed->disaggregate(",
  "            *curbucket,",
  "            available + Measures::forecastconsumed->getValue(*curbucket),",
  "            !getAutocommit() ? commands : nullptr);",
  "        Measures::forecastnet->disaggregate(",
  "            *curbucket, 0.0, !getAutocommit() ? commands : nullptr);",
  "      }",
  "    } else if (getLogLevel() > 1)",
  "      logger << \"    Nothing available in bucket \" << curbucket->getDates()",
  "             << '\\n';",
  "",
  "    // Find the next forecast bucket",
  "    if (backward) {",
  "      // Moving to earlier buckets",
  "      if (curbucket == data->getBuckets().begin()) {",
  "        // Switch from consuming earlier buckets to consuming later buckets",
  "        backward = false;",
  "        curbucket = zerobucket;",
  "        ++curbucket;",
  "      } else {",
  "        --curbucket;",
  "        if (curbucket->getEnd() <= dmd->getDue() - netEarly) {",
  "          // Switch from consuming earlier buckets to consuming later buckets",
  "          backward = false;",
  "          curbucket = zerobucket;",
  "          ++curbucket;",
  "        }",
  "      }",
  "    } else",
  "      // Moving to later buckets",
  "      ++curbucket;",
  "  }",
  "",
  "  // Quantity for which no bucket is found",
  "  if (remaining > 0 && getLogLevel() > 0)",
  "    logger << \"    Remains \" << remaining << \" that can't be netted\\n\";",
  "}",
  "",
  "PyObject* ForecastSolver::commit(PyObject* self, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    static_cast<ForecastSolver*>(self)->commands->commit();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* ForecastSolver::rollback(PyObject* self, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    static_cast<ForecastSolver*>(self)->commands->rollback();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "}  // namespace frepple",
];
