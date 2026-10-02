export function getZoomAdjustedResizeValue(
	currentValue: number,
	measuredValue: number,
	zoom: number,
	min: number,
	max = Number.POSITIVE_INFINITY
) {
	const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
	const nextValue = currentValue + (measuredValue - currentValue) / safeZoom
	return Math.min(max, Math.max(min, Math.round(nextValue)))
}
