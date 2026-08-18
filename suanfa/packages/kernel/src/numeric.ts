export const ROUNDING_ERROR = 1e-9;

export function isZero(value: number, epsilon = ROUNDING_ERROR): boolean {
  return Math.abs(value) <= epsilon;
}

export function compareNumbers(
  left: number,
  right: number,
  epsilon = ROUNDING_ERROR
): number {
  const difference = left - right;
  return Math.abs(difference) <= epsilon ? 0 : difference < 0 ? -1 : 1;
}

export function approximatelyEqual(
  left: number,
  right: number,
  absoluteTolerance = ROUNDING_ERROR,
  relativeTolerance = ROUNDING_ERROR
): boolean {
  const difference = Math.abs(left - right);
  return (
    difference <= absoluteTolerance ||
    difference <= Math.max(Math.abs(left), Math.abs(right)) * relativeTolerance
  );
}
