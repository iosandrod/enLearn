import { ROUNDING_ERROR } from "@suanfa/kernel";

import { Forecast } from "./forecast.js";

export enum ForecastMethod {
  Constant = 1,
  Trend = 2,
  Seasonal = 4,
  Croston = 8,
  MovingAverage = 16,
  Manual = 32
}

export interface ForecastSolverOptions {
  readonly iterations?: number;
  readonly smapeAlfa?: number;
  readonly skip?: number;
  readonly outlierMaxDeviation?: number;
  readonly movingAverageOrder?: number;
  readonly deadAfterInactivityDays?: number;
}

interface Metrics {
  readonly method: ForecastMethod;
  readonly smape: number;
  readonly deviation: number;
  readonly force: boolean;
  readonly predict: (count: number, discrete: boolean) => readonly number[];
}

interface SolverSettings {
  readonly iterations: number;
  readonly smapeAlfa: number;
  readonly skip: number;
  readonly outlierMaxDeviation: number;
  readonly movingAverageOrder: number;
  readonly deadAfterInactivityDays: number;
}

interface Cycle {
  readonly period: number;
  readonly autocorrelation: number;
}

const DEFAULT_SETTINGS: SolverSettings = {
  iterations: 15,
  smapeAlfa: 0.95,
  skip: 5,
  outlierMaxDeviation: 4,
  movingAverageOrder: 5,
  deadAfterInactivityDays: 365
};

const MAX_ERROR = Number.MAX_VALUE;

export function computeBaselineForecast(
  forecast: Forecast,
  current: number,
  options: ForecastSolverOptions = {}
): ForecastMethod | 0 {
  const settings: SolverSettings = { ...DEFAULT_SETTINGS, ...options };
  const buckets = forecast.buckets;
  let start = 0;
  let bucketCount = 1;
  while (start < buckets.length && bucketEnd(buckets, start) <= current) {
    if ((buckets[start]?.orderTotal ?? 0) !== 0) {
      break;
    }
    start += 1;
    bucketCount += 1;
  }

  let historyEnd = start;
  while (historyEnd < buckets.length && bucketEnd(buckets, historyEnd) <= current) {
    historyEnd += 1;
    bucketCount += 1;
  }
  const history = buckets.slice(start, historyEnd).map((bucket) => bucket.orderTotal);
  const historyCount = history.length;
  const trailingZeroes = countTrailingZeroes(history);
  const deadAfterInactivity = convertDeadAfterInactivity(
    buckets,
    historyEnd,
    bucketCount,
    settings.deadAfterInactivityDays
  );
  const methods = eligibleMethods(
    history,
    historyCount,
    trailingZeroes,
    deadAfterInactivity,
    settings
  );

  let best: Metrics | undefined;
  for (const method of methods) {
    const result = method(history, settings);
    if (!best || result.smape < best.smape || result.force) {
      best = result;
      if (result.force) {
        break;
      }
    }
  }

  if (!best) {
    forecast.setMetrics(0, 0, 0);
    return 0;
  }

  const values = best.predict(buckets.length - historyEnd, forecast.discrete);
  for (let index = historyEnd; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    const value = values[index - historyEnd] ?? 0;
    if (bucket) {
      forecast.setBaseline(bucket.start, Math.max(0, value));
    }
  }
  forecast.setMetrics(best.method, best.smape, best.deviation);
  return best.method;
}

function eligibleMethods(
  history: readonly number[],
  historyCount: number,
  trailingZeroes: number,
  deadAfterInactivity: number,
  settings: SolverSettings
): readonly ((history: readonly number[], settings: SolverSettings) => Metrics)[] {
  if (historyCount <= settings.skip + 5) {
    return [movingAverage];
  }
  if (trailingZeroes >= deadAfterInactivity) {
    return [manual];
  }
  const zeroes = history.filter((value) => value === 0).length;
  if (zeroes > 0.33 * historyCount) {
    return [croston];
  }
  return [movingAverage, singleExponential, doubleExponential, seasonal];
}

function movingAverage(history: readonly number[], settings: SolverSettings): Metrics {
  const count = history.length;
  const series = [...history, 0];
  const clean = new Array<number>(count + 1).fill(0);
  let average = 0;
  let standardDeviation = 0;
  let maximumDeviation = 0;
  let smape = 0;
  let smapeWeights = 0;

  for (let outliers = 0; outliers <= 1; outliers += 1) {
    if (outliers === 1) {
      clean[0] = series[0] ?? 0;
    }
    smape = 0;
    smapeWeights = 0;
    for (let index = 1; index <= count; index += 1) {
      const actual = series[index] ?? 0;
      const source = outliers === 0 ? series : clean;
      let sum = 0;
      for (let offset = 0; offset < settings.movingAverageOrder && offset < index; offset += 1) {
        sum += source[index - offset - 1] ?? 0;
      }
      average = sum / settings.movingAverageOrder;
      if (index === count) {
        break;
      }

      if (outliers === 0) {
        const residual = average - actual;
        standardDeviation += residual * residual;
        maximumDeviation = Math.max(maximumDeviation, Math.abs(residual));
      } else {
        clean[index] = clampOutlier(actual, average, standardDeviation, settings);
      }

      if (
        index >= settings.skip &&
        Math.abs(average + actual) > ROUNDING_ERROR
      ) {
        const weight = weightFor(count, index, settings);
        smape += (Math.abs(average - actual) / Math.abs(average + actual)) * weight;
        smapeWeights += weight;
      }
    }

    if (outliers === 0) {
      if (count > 1) {
        standardDeviation = Math.sqrt(standardDeviation / (count - 1));
        maximumDeviation /= standardDeviation;
        if (maximumDeviation < settings.outlierMaxDeviation) {
          break;
        }
      } else {
        standardDeviation = Math.sqrt(standardDeviation);
        break;
      }
    }
  }

  return {
    method: ForecastMethod.MovingAverage,
    smape: smapeWeights ? smape / smapeWeights : 0,
    deviation: standardDeviation,
    force: false,
    predict: (futureCount, discrete) => constantPrediction(average, futureCount, discrete)
  };
}

function singleExponential(history: readonly number[], settings: SolverSettings): Metrics {
  const count = history.length;
  if (count < settings.skip + 5) {
    return invalid(ForecastMethod.Constant);
  }

  const series = [...history, 0];
  let alfa = 0.2;
  let bestError = MAX_ERROR;
  let bestSmape = 0;
  let bestForecast = 0;
  let bestDeviation = 0;
  let upperBoundaryTested = false;
  let lowerBoundaryTested = false;

  for (let iteration = 1; iteration <= settings.iterations; iteration += 1) {
    let error = 0;
    let smape = 0;
    let smapeWeights = 0;
    let sum11 = 0;
    let sum12 = 0;
    let standardDeviation = 0;
    let maximumDeviation = 0;
    let forecastValue = 0;

    for (let outliers = 0; outliers <= 1; outliers += 1) {
      error = 0;
      smape = 0;
      smapeWeights = 0;
      sum11 = 0;
      sum12 = 0;
      let derivative = 0;
      let history0 = series[0] ?? 0;
      let history1 = series[1] ?? 0;
      let history2 = series[2] ?? 0;
      forecastValue = (history0 + history1 + history2) / 3;
      if (outliers === 1) {
        history0 = clampOutlier(history0, forecastValue, standardDeviation, settings);
        history1 = clampOutlier(history1, forecastValue, standardDeviation, settings);
        history2 = clampOutlier(history2, forecastValue, standardDeviation, settings);
        forecastValue = (history0 + history1 + history2) / 3;
      }

      let current = history0;
      for (let index = 1; index <= count; index += 1) {
        const previous = current;
        current = series[index] ?? 0;
        derivative = previous - forecastValue + (1 - alfa) * derivative;
        forecastValue = previous * alfa + (1 - alfa) * forecastValue;
        if (index === count) {
          break;
        }
        if (outliers === 0) {
          const residual = forecastValue - current;
          standardDeviation += residual * residual;
          maximumDeviation = Math.max(maximumDeviation, Math.abs(residual));
        } else {
          current = clampOutlier(current, forecastValue, standardDeviation, settings);
        }
        const weight = weightFor(count, index, settings);
        sum12 += derivative * (current - forecastValue) * weight;
        sum11 += derivative * derivative * weight;
        if (index >= settings.skip) {
          const residual = forecastValue - current;
          error += residual * residual * weight;
          if (Math.abs(forecastValue + current) > ROUNDING_ERROR) {
            smape += (Math.abs(residual) / (forecastValue + current)) * weight;
            smapeWeights += weight;
          }
        }
      }

      if (outliers === 0) {
        standardDeviation = Math.sqrt(standardDeviation / (count - 1));
        maximumDeviation /= standardDeviation;
        if (maximumDeviation < settings.outlierMaxDeviation) {
          break;
        }
      }
    }

    if (error < bestError) {
      bestError = error;
      bestSmape = smapeWeights ? smape / smapeWeights : 0;
      bestForecast = forecastValue;
      bestDeviation = standardDeviation;
    }
    const dampedSum11 =
      Math.abs(sum11 + error / iteration) > ROUNDING_ERROR
        ? sum11 + error / iteration
        : sum11;
    if (Math.abs(dampedSum11) < ROUNDING_ERROR) {
      break;
    }
    const delta = sum12 / dampedSum11;
    if (Math.abs(delta) < 0.01 && iteration > 3) {
      break;
    }
    alfa += delta;
    if (alfa > 1) {
      alfa = 1;
      if (upperBoundaryTested) {
        break;
      }
      upperBoundaryTested = true;
    } else if (alfa < 0.03) {
      alfa = 0.03;
      if (lowerBoundaryTested) {
        break;
      }
      lowerBoundaryTested = true;
    }
  }

  return {
    method: ForecastMethod.Constant,
    smape: bestSmape,
    deviation: bestDeviation,
    force: false,
    predict: (futureCount, discrete) =>
      constantPrediction(bestForecast, futureCount, discrete)
  };
}

function doubleExponential(history: readonly number[], settings: SolverSettings): Metrics {
  const count = history.length;
  if (count < settings.skip + 5) {
    return invalid(ForecastMethod.Trend);
  }

  const series = [...history, 0];
  let alfa = 0.2;
  let gamma = 0.2;
  let bestError = MAX_ERROR;
  let bestSmape = 0;
  let bestConstant = 0;
  let bestTrend = 0;
  let bestDeviation = 0;
  let boundaryTested = 0;

  for (let iteration = 1; iteration <= settings.iterations; iteration += 1) {
    let error = 0;
    let smape = 0;
    let smapeWeights = 0;
    let sum11 = 0;
    let sum12 = 0;
    let sum22 = 0;
    let sum13 = 0;
    let sum23 = 0;
    let standardDeviation = 0;
    let maximumDeviation = 0;
    let constant = 0;
    let trend = 0;

    for (let outliers = 0; outliers <= 1; outliers += 1) {
      error = 0;
      smape = 0;
      smapeWeights = 0;
      sum11 = 0;
      sum12 = 0;
      sum22 = 0;
      sum13 = 0;
      sum23 = 0;
      let dConstantAlfa = 0;
      let dConstantGamma = 0;
      let dTrendAlfa = 0;
      let dTrendGamma = 0;
      let dForecastAlfa = 0;
      let dForecastGamma = 0;
      let history0 = series[0] ?? 0;
      let history1 = series[1] ?? 0;
      let history2 = series[2] ?? 0;
      const history3 = series[3] ?? 0;
      constant = (history0 + history1 + history2) / 3;
      trend = (history3 - history0) / 3;
      if (outliers === 1) {
        const filtered0 = clampOutlier(history0, constant, standardDeviation, settings);
        const filtered1 = clampOutlier(history1, constant + trend, standardDeviation, settings);
        const filtered2 = clampOutlier(history2, constant + 2 * trend, standardDeviation, settings);
        constant = (filtered0 + filtered1 + filtered2) / 3;
        trend = (-filtered0 + filtered2) / 3;
        history0 = filtered0;
        history1 = filtered1;
        history2 = filtered2;
      }

      let current = history0;
      for (let index = 1; index <= count; index += 1) {
        const previous = current;
        current = series[index] ?? 0;
        const previousConstant = constant;
        const previousTrend = trend;
        constant = previous * alfa + (1 - alfa) * (previousConstant + previousTrend);
        trend = gamma * (constant - previousConstant) + (1 - gamma) * previousTrend;
        if (index === count) {
          break;
        }
        if (outliers === 0) {
          const residual = constant + trend - current;
          standardDeviation += residual * residual;
          maximumDeviation = Math.max(maximumDeviation, Math.abs(residual));
        } else {
          current = clampOutlier(current, constant + trend, standardDeviation, settings);
        }
        const previousDConstantGamma = dConstantGamma;
        const previousDConstantAlfa = dConstantAlfa;
        dConstantAlfa =
          previous - previousConstant - previousTrend + (1 - alfa) * dForecastAlfa;
        dConstantGamma = (1 - alfa) * dForecastGamma;
        dTrendAlfa =
          gamma * (dConstantAlfa - previousDConstantAlfa) + (1 - gamma) * dTrendAlfa;
        dTrendGamma =
          constant - previousConstant - previousTrend +
          gamma * (dConstantGamma - previousDConstantGamma) +
          (1 - gamma) * dTrendGamma;
        dForecastAlfa = dConstantAlfa + dTrendAlfa;
        dForecastGamma = dConstantGamma + dTrendGamma;
        const weight = weightFor(count, index, settings);
        sum11 += weight * dForecastAlfa * dForecastAlfa;
        sum12 += weight * dForecastAlfa * dForecastGamma;
        sum22 += weight * dForecastGamma * dForecastGamma;
        sum13 += weight * dForecastAlfa * (current - constant - trend);
        sum23 += weight * dForecastGamma * (current - constant - trend);
        if (index >= settings.skip) {
          const residual = constant + trend - current;
          error += residual * residual * weight;
          if (Math.abs(constant + trend + current) > ROUNDING_ERROR) {
            smape += (Math.abs(residual) / Math.abs(constant + trend + current)) * weight;
            smapeWeights += weight;
          }
        }
      }

      if (outliers === 0) {
        standardDeviation = Math.sqrt(standardDeviation / (count - 1));
        maximumDeviation /= standardDeviation;
        if (maximumDeviation < settings.outlierMaxDeviation) {
          break;
        }
      }
    }

    if (error < bestError) {
      bestError = error;
      bestSmape = smapeWeights ? smape / smapeWeights : 0;
      bestConstant = constant;
      bestTrend = trend;
      bestDeviation = standardDeviation;
    }
    sum11 += error / iteration;
    sum22 += error / iteration;
    let determinant = sum11 * sum22 - sum12 * sum12;
    if (Math.abs(determinant) < ROUNDING_ERROR) {
      sum11 -= error / iteration;
      sum22 -= error / iteration;
      determinant = sum11 * sum22 - sum12 * sum12;
      if (Math.abs(determinant) < ROUNDING_ERROR) {
        break;
      }
    }
    const deltaAlfa = (sum13 * sum22 - sum23 * sum12) / determinant;
    const deltaGamma = (sum23 * sum11 - sum13 * sum12) / determinant;
    if (Math.abs(deltaAlfa) + Math.abs(deltaGamma) < 0.02 && iteration > 3) {
      break;
    }
    alfa = clamp(alfa + deltaAlfa, 0.02, 1);
    gamma = clamp(gamma + deltaGamma, 0.05, 1);
    if ((gamma === 0.05 || gamma === 1) && (alfa === 0.02 || alfa === 1)) {
      if (boundaryTested++ > 5) {
        break;
      }
    }
  }

  return {
    method: ForecastMethod.Trend,
    smape: bestSmape,
    deviation: bestDeviation,
    force: false,
    predict: (futureCount, discrete) =>
      trendPrediction(bestConstant, bestTrend, futureCount, discrete)
  };
}

function seasonal(history: readonly number[], settings: SolverSettings): Metrics {
  const count = history.length;
  const cycle = detectCycle(history);
  if (!cycle.period) {
    return invalid(ForecastMethod.Seasonal);
  }
  const period = cycle.period;
  const series = [...history, 0];
  let initialLevel = 0;
  let initialTrend = 0;
  const initialSeason = new Array<number>(period).fill(0);
  for (let index = 0; index < period; index += 1) {
    initialLevel += series[index] ?? 0;
    initialTrend += (series[index + period] ?? 0) - (series[index] ?? 0);
  }
  initialLevel /= period;
  initialTrend /= period;
  let cycleCount = 0;
  for (let index = 0; index + period <= count; index += period) {
    cycleCount += 1;
    let sum = 0;
    for (let offset = 0; offset < period; offset += 1) {
      sum += series[index + offset] ?? 0;
    }
    if (sum) {
      for (let offset = 0; offset < period; offset += 1) {
        initialSeason[offset] = (initialSeason[offset] ?? 0) +
          ((series[index + offset] ?? 0) / sum) * period;
      }
    }
  }
  for (let index = 0; index < period; index += 1) {
    initialSeason[index] = (initialSeason[index] ?? 0) / cycleCount;
  }

  let alfa = 0.2;
  let beta = 0.2;
  let bestError = MAX_ERROR;
  let bestSmape = 0;
  let bestDeviation = 0;
  let bestLevel = initialLevel;
  let bestTrend = initialTrend;
  let bestSeason = [...initialSeason];
  let bestCycleIndex = 0;
  let boundaryTested = 0;

  for (let iteration = 1; iteration <= settings.iterations; iteration += 1) {
    let error = 0;
    let smape = 0;
    let smapeWeights = 0;
    let sum11 = 0;
    let sum12 = 0;
    let sum13 = 0;
    let sum22 = 0;
    let sum23 = 0;
    let standardDeviation = 0;
    let dLevelAlfa = 0;
    let dLevelBeta = 0;
    let dTrendAlfa = 0;
    let dTrendBeta = 0;
    const dSeasonAlfa = new Array<number>(period).fill(0);
    const dSeasonBeta = new Array<number>(period).fill(0);
    let level = initialLevel;
    let trend = initialTrend;
    let cycleSum = 0;
    const season = [...initialSeason];
    for (let index = 1; index < period; index += 1) {
      cycleSum += series[index - 1] ?? 0;
    }
    let previousCycleIndex = period - 1;
    let cycleIndex = 0;

    for (let index = period; index <= count; index += 1) {
      const previousLevel = level;
      const actual = index === count ? 0 : (series[index] ?? 0);
      cycleSum += series[index - 1] ?? 0;
      if (index > period) {
        cycleSum -= series[index - period - 1] ?? 0;
      }
      level = alfa * cycleSum / period + (1 - alfa) * (level + trend);
      if (level < 0) {
        level = 0;
      }
      trend = beta * (level - previousLevel) + (1 - beta) * trend;
      let factor = -(season[previousCycleIndex] ?? 0);
      if (level) {
        season[previousCycleIndex] =
          0.05 * (series[index - 1] ?? 0) / level +
          0.95 * (season[previousCycleIndex] ?? 0);
      }
      if ((season[previousCycleIndex] ?? 0) < 0) {
        season[previousCycleIndex] = 0;
      }
      factor = period / (period + factor + (season[previousCycleIndex] ?? 0));
      for (let seasonIndex = 0; seasonIndex < period; seasonIndex += 1) {
        season[seasonIndex] = (season[seasonIndex] ?? 0) * factor;
      }
      if (index === count) {
        break;
      }

      const previousDLevelAlfa = dLevelAlfa;
      const previousDLevelBeta = dLevelBeta;
      const previousDTrendAlfa = dTrendAlfa;
      const previousDTrendBeta = dTrendBeta;
      const previousDSeasonAlfa = dSeasonAlfa[previousCycleIndex] ?? 0;
      const previousDSeasonBeta = dSeasonBeta[previousCycleIndex] ?? 0;
      dLevelAlfa =
        cycleSum / period - (level + trend) +
        (1 - alfa) * (previousDLevelAlfa + previousDTrendAlfa);
      dLevelBeta = (1 - alfa) * (previousDLevelBeta + previousDTrendBeta);
      if (level > ROUNDING_ERROR) {
        dSeasonAlfa[previousCycleIndex] =
          -0.05 * (series[index - 1] ?? 0) / level / level * previousDLevelAlfa +
          0.95 * previousDSeasonAlfa;
        dSeasonBeta[previousCycleIndex] =
          -0.05 * (series[index - 1] ?? 0) / level / level * previousDLevelBeta +
          0.95 * previousDSeasonBeta;
      } else {
        dSeasonAlfa[previousCycleIndex] = 0.95 * previousDSeasonAlfa;
        dSeasonBeta[previousCycleIndex] = 0.95 * previousDSeasonBeta;
      }
      dTrendAlfa =
        beta * (dLevelAlfa - previousDLevelAlfa) + (1 - beta) * previousDTrendAlfa;
      dTrendBeta =
        (level - previousLevel) +
        beta * (dLevelBeta - previousDLevelBeta) -
        trend +
        (1 - beta) * previousDTrendBeta;
      const dForecastAlfa =
        (dLevelAlfa + dTrendAlfa) * (season[cycleIndex] ?? 0) +
        (level + trend) * (dSeasonAlfa[cycleIndex] ?? 0);
      const dForecastBeta =
        (dLevelBeta + dTrendBeta) * (season[cycleIndex] ?? 0) +
        (level + trend) * (dSeasonBeta[cycleIndex] ?? 0);
      const forecastValue = (level + trend) * (season[cycleIndex] ?? 0);
      const weight = weightFor(count, index, settings);
      sum11 += weight * dForecastAlfa * dForecastAlfa;
      sum12 += weight * dForecastAlfa * dForecastBeta;
      sum22 += weight * dForecastBeta * dForecastBeta;
      sum13 += weight * dForecastAlfa * (actual - forecastValue);
      sum23 += weight * dForecastBeta * (actual - forecastValue);
      if (index >= settings.skip) {
        const residual = forecastValue - actual;
        error += residual * residual * weight;
        if (Math.abs(forecastValue + actual) > ROUNDING_ERROR) {
          smape += (Math.abs(residual) / Math.abs(forecastValue + actual)) * weight;
          smapeWeights += weight;
          standardDeviation += residual * residual;
        }
      }
      cycleIndex = (cycleIndex + 1) % period;
      previousCycleIndex = (previousCycleIndex + 1) % period;
    }

    if (error < bestError) {
      bestError = error;
      bestSmape = smapeWeights ? smape / smapeWeights : 0;
      bestDeviation = Math.sqrt(standardDeviation / (count - period - 1));
      bestLevel = level;
      bestTrend = trend;
      bestSeason = season;
      bestCycleIndex = cycleIndex;
    }
    sum11 += error / iteration;
    sum22 += error / iteration;
    let determinant = sum11 * sum22 - sum12 * sum12;
    if (Math.abs(determinant) < ROUNDING_ERROR) {
      sum11 -= error / iteration;
      sum22 -= error / iteration;
      determinant = sum11 * sum22 - sum12 * sum12;
      if (Math.abs(determinant) < ROUNDING_ERROR) {
        break;
      }
    }
    const deltaAlfa = (sum13 * sum22 - sum23 * sum12) / determinant;
    const deltaBeta = (sum23 * sum11 - sum13 * sum12) / determinant;
    if (Math.abs(deltaAlfa) + Math.abs(deltaBeta) < 0.03 && iteration > 3) {
      break;
    }
    alfa = clamp(alfa + deltaAlfa, 0.02, 1);
    beta = clamp(beta + deltaBeta, 0.2, 1);
    if ((beta === 0.2 || beta === 1) && (alfa === 0.02 || alfa === 1)) {
      if (boundaryTested++ > 5) {
        break;
      }
    }
  }

  if (period > settings.skip) {
    bestSmape *= count - settings.skip;
    bestSmape /= count - period;
  }
  return {
    method: ForecastMethod.Seasonal,
    smape: bestSmape,
    deviation: bestDeviation,
    force: cycle.autocorrelation > 0.8,
    predict: (futureCount, discrete) =>
      seasonalPrediction(
        bestLevel,
        bestTrend,
        bestSeason,
        bestCycleIndex,
        futureCount,
        discrete
      )
  };
}

function croston(history: readonly number[], settings: SolverSettings): Metrics {
  const count = history.length;
  const series = [...history, 0];
  let nonzero = 0;
  let total = 0;
  let lastNonzero = 0;
  for (let index = 0; index < count; index += 1) {
    const value = series[index] ?? 0;
    if (value) {
      nonzero += 1;
      total += value;
      lastNonzero = index;
    }
  }
  if (!nonzero) {
    return {
      method: ForecastMethod.Croston,
      smape: 0,
      deviation: 0,
      force: false,
      predict: (futureCount, discrete) => constantPrediction(0, futureCount, discrete)
    };
  }

  const periodsBetweenDemands = count / nonzero;
  const delta = settings.iterations > 1 ? (0.8 - 0.03) / (settings.iterations - 1) : 0;
  let alfa = 0.03;
  let betweenDemands = 1;
  let bestError = MAX_ERROR;
  let bestSmape = 0;
  let bestForecast = 0;
  let bestDeviation = 0;

  for (let iteration = 0; iteration < settings.iterations; iteration += 1) {
    let smape = 0;
    let smapeWeights = 0;
    let standardDeviation = 0;
    let maximumDeviation = 0;
    let forecastValue = 0;

    for (let outliers = 0; outliers <= 1; outliers += 1) {
      smape = 0;
      smapeWeights = 0;
      let quantity = total / nonzero;
      let period = count / nonzero;
      forecastValue = (1 - alfa / 2) * quantity / period;
      let current = series[0] ?? 0;
      for (let index = 1; index <= count; index += 1) {
        const previous = current;
        current = series[index] ?? 0;
        if (previous) {
          quantity = alfa * previous + (1 - alfa) * quantity;
          period = alfa * betweenDemands + (1 - alfa) * period;
          forecastValue = (1 - alfa / 2) * quantity / period;
          betweenDemands = 1;
        } else if (
          index > lastNonzero &&
          betweenDemands > 2 * periodsBetweenDemands
        ) {
          forecastValue *= 0.9;
          period = (1 - alfa / 2) * quantity / forecastValue;
        } else {
          betweenDemands += 1;
        }
        if (index === count) {
          break;
        }
        if (outliers === 0) {
          const residual = forecastValue - current;
          standardDeviation += residual * residual;
          maximumDeviation = Math.max(maximumDeviation, Math.abs(residual));
        } else if (current > forecastValue + settings.outlierMaxDeviation * standardDeviation) {
          current = forecastValue + settings.outlierMaxDeviation * standardDeviation;
        }
        if (index >= settings.skip && period > 0) {
          if (Math.abs(forecastValue + current) > ROUNDING_ERROR) {
            const weight = weightFor(count, index, settings);
            smape += (Math.abs(forecastValue - current) / Math.abs(forecastValue + current)) * weight;
            smapeWeights += weight;
          }
        }
      }
      if (outliers === 0) {
        standardDeviation = count > 1 ? Math.sqrt(standardDeviation / (count - 1)) : 0;
        if (standardDeviation > ROUNDING_ERROR) {
          maximumDeviation /= standardDeviation;
        }
        if (maximumDeviation < settings.outlierMaxDeviation) {
          break;
        }
      }
    }

    if (smape <= bestError) {
      bestError = smape;
      bestSmape = smapeWeights ? smape / smapeWeights : 0;
      bestForecast = forecastValue;
      bestDeviation = standardDeviation;
    }
    if (!delta) {
      break;
    }
    alfa += delta;
  }

  return {
    method: ForecastMethod.Croston,
    smape: bestSmape,
    deviation: bestDeviation,
    force: false,
    predict: (futureCount, discrete) =>
      constantPrediction(bestForecast, futureCount, discrete)
  };
}

function manual(): Metrics {
  return {
    method: ForecastMethod.Manual,
    smape: 0,
    deviation: 0,
    force: true,
    predict: (futureCount, discrete) => constantPrediction(0, futureCount, discrete)
  };
}

function detectCycle(history: readonly number[]): Cycle {
  const count = history.length;
  if (count < 4) {
    return { period: 0, autocorrelation: 0.5 };
  }
  const average = history.reduce((sum, value) => sum + value, 0) / count;
  let variance = 0;
  for (const value of history) {
    variance += (value - average) * (value - average);
  }
  variance /= count;
  let bestPeriod = 0;
  let bestAutocorrelation = 0.5;
  const correlations = new Array<number>(7).fill(10);
  for (let period = 2; period <= 14 && period < count / 2; period += 1) {
    for (let index = 6; index > 0; index -= 1) {
      correlations[index] = correlations[index - 1] ?? 10;
    }
    let correlation = 0;
    for (let index = period; index < count; index += 1) {
      correlation +=
        ((history[index - period] ?? 0) - average) *
        ((history[index] ?? 0) - average);
    }
    correlation /= count - period;
    correlation /= variance;
    correlations[0] = correlation;
    if (
      period > 3 &&
      (correlations[1] ?? 0) > (correlations[2] ?? 0) * 1.1 &&
      (correlations[1] ?? 0) > (correlations[0] ?? 0) * 1.1 &&
      (correlations[1] ?? 0) > bestAutocorrelation
    ) {
      bestAutocorrelation = correlations[1] ?? bestAutocorrelation;
      bestPeriod = period - 1;
    }
    if (
      period > 6 &&
      (correlations[2] ?? 0) > bestAutocorrelation &&
      (correlations[2] ?? 0) > ((correlations[0] ?? 0) + (correlations[1] ?? 0)) / 2 &&
      (correlations[2] ?? 0) > ((correlations[3] ?? 0) + (correlations[4] ?? 0)) / 2
    ) {
      bestAutocorrelation = correlations[2] ?? bestAutocorrelation;
      bestPeriod = period - 2;
    }
    if (
      period > 8 &&
      (correlations[3] ?? 0) > bestAutocorrelation &&
      (correlations[3] ?? 0) >
        ((correlations[0] ?? 0) + (correlations[1] ?? 0) + (correlations[2] ?? 0)) / 3 &&
      (correlations[3] ?? 0) >
        ((correlations[4] ?? 0) + (correlations[5] ?? 0) + (correlations[6] ?? 0)) / 3
    ) {
      bestAutocorrelation = correlations[3] ?? bestAutocorrelation;
      bestPeriod = period - 3;
    }
  }
  return { period: bestPeriod, autocorrelation: bestAutocorrelation };
}

function constantPrediction(value: number, count: number, discrete: boolean): readonly number[] {
  if (!discrete) {
    return new Array<number>(count).fill(Math.max(0, value));
  }
  return roundDiscrete(new Array<number>(count).fill(value));
}

function trendPrediction(
  initialConstant: number,
  initialTrend: number,
  count: number,
  discrete: boolean
): readonly number[] {
  const values: number[] = [];
  let constant = initialConstant;
  let trend = initialTrend;
  for (let index = 0; index < count; index += 1) {
    constant += trend;
    trend *= 0.8;
    values.push(Math.max(0, constant));
  }
  return discrete ? roundDiscrete(values) : values;
}

function seasonalPrediction(
  initialLevel: number,
  initialTrend: number,
  season: readonly number[],
  initialCycleIndex: number,
  count: number,
  discrete: boolean
): readonly number[] {
  const values: number[] = [];
  let level = initialLevel;
  let trend = initialTrend;
  let cycleIndex = initialCycleIndex;
  for (let index = 0; index < count; index += 1) {
    level += trend;
    trend *= 0.8;
    values.push(Math.max(0, level * (season[cycleIndex] ?? 0)));
    cycleIndex = (cycleIndex + 1) % season.length;
  }
  return discrete ? roundDiscrete(values) : values;
}

function roundDiscrete(values: readonly number[]): readonly number[] {
  let carryover = 0;
  return values.map((value) => {
    carryover += value;
    const rounded = Math.ceil(carryover - 0.5);
    carryover -= rounded;
    return Math.max(0, rounded);
  });
}

function invalid(method: ForecastMethod): Metrics {
  return {
    method,
    smape: MAX_ERROR,
    deviation: MAX_ERROR,
    force: false,
    predict: () => []
  };
}

function countTrailingZeroes(history: readonly number[]): number {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if ((history[index] ?? 0) !== 0) {
      break;
    }
    count += 1;
  }
  return count;
}

function convertDeadAfterInactivity(
  buckets: readonly { readonly start: number; readonly end: number }[],
  historyEnd: number,
  bucketCount: number,
  days: number
): number {
  const first = buckets[0];
  const afterHistory = buckets[historyEnd];
  if (!first || !afterHistory) {
    return 0;
  }
  return Math.ceil(days * 86_400 * bucketCount / (afterHistory.end - first.start));
}

function bucketEnd(
  buckets: readonly { readonly end: number }[],
  index: number
): number {
  return buckets[index]?.end ?? Number.POSITIVE_INFINITY;
}

function weightFor(count: number, index: number, settings: SolverSettings): number {
  return settings.smapeAlfa ** (count - index);
}

function clampOutlier(
  value: number,
  forecast: number,
  standardDeviation: number,
  settings: SolverSettings
): number {
  const threshold = settings.outlierMaxDeviation * standardDeviation;
  if (value > forecast + threshold) {
    return forecast + threshold;
  }
  if (value < forecast - threshold) {
    return forecast - threshold;
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
