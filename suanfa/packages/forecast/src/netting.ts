import { ROUNDING_ERROR, type EpochSeconds } from "@suanfa/kernel";

import { Forecast, type ForecastIdentity } from "./forecast.js";
import type { ForecastPlan, NettingOptions, SalesOrder } from "./fixture.js";
import { computeBaselineForecast } from "./timeseries.js";

export function solveForecastPlan(plan: ForecastPlan): void {
  for (const forecast of plan.forecasts) {
    computeBaselineForecast(forecast, plan.current, plan.solverOptions);
  }
  for (const forecast of plan.forecasts) {
    forecast.resetNet(
      plan.current,
      plan.nettingOptions.netPastDemand,
      plan.nettingOptions.netLateSeconds
    );
  }
  for (const order of sortedOrders(plan.orders)) {
    const forecast = matchingForecast(order, plan.forecasts, plan.nettingOptions);
    if (forecast) {
      netOrder(order, forecast, plan.current, plan.nettingOptions);
    }
  }
}

export function netOrder(
  order: SalesOrder,
  forecast: Forecast,
  current: EpochSeconds,
  options: NettingOptions
): number {
  const zeroBucket = forecast.bucketIndexAt(order.due);
  if (zeroBucket < 0) {
    throw new RangeError(`No forecast bucket for order "${order.name}"`);
  }
  const zeroBucketEnd = forecast.bucketEnd(zeroBucket);
  if (
    zeroBucketEnd === undefined ||
    zeroBucketEnd <= current - (options.netPastDemand ? options.netLateSeconds : 0)
  ) {
    return order.quantity;
  }

  let remaining = order.quantity;
  let bucketIndex = zeroBucket;
  let backward = true;
  while (
    remaining > ROUNDING_ERROR &&
    bucketIndex >= 0 &&
    bucketIndex < forecast.buckets.length
  ) {
    const bucketStart = forecast.bucketStart(bucketIndex);
    const bucketEnd = forecast.bucketEnd(bucketIndex);
    if (
      bucketStart === undefined ||
      bucketEnd === undefined ||
      order.due - options.netEarlySeconds >= bucketEnd ||
      order.due + options.netLateSeconds < bucketStart
    ) {
      break;
    }

    remaining -= forecast.consume(bucketIndex, remaining);
    if (backward) {
      if (bucketIndex === 0) {
        backward = false;
        bucketIndex = zeroBucket + 1;
      } else {
        bucketIndex -= 1;
        const previousEnd = forecast.bucketEnd(bucketIndex);
        if (
          previousEnd === undefined ||
          previousEnd <= order.due - options.netEarlySeconds
        ) {
          backward = false;
          bucketIndex = zeroBucket + 1;
        }
      }
    } else {
      bucketIndex += 1;
    }
  }
  return remaining;
}

function matchingForecast(
  order: SalesOrder,
  forecasts: readonly Forecast[],
  options: NettingOptions
): Forecast | undefined {
  return forecasts.find((forecast) =>
    identitiesMatch(order, forecast.identity, options)
  );
}

function identitiesMatch(
  order: SalesOrder,
  forecast: ForecastIdentity,
  options: NettingOptions
): boolean {
  return (
    order.item === forecast.item &&
    order.customer === forecast.customer &&
    (options.netIgnoreLocation || order.location === forecast.location) &&
    (!options.matchUsingDeliveryOperation ||
      order.deliveryOperation === forecast.deliveryOperation)
  );
}

function sortedOrders(orders: readonly SalesOrder[]): readonly SalesOrder[] {
  return [...orders].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.due - right.due ||
      left.name.localeCompare(right.name)
  );
}
