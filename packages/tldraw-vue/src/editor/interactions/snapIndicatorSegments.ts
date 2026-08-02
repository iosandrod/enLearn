import {
	rangeIntersection,
	type GapsSnapIndicator,
	type PointsSnapIndicator,
	type SnapIndicator,
} from '@tldraw/editor'

export interface SnapLineSegment {
	id: string
	x1: number
	x2: number
	y1: number
	y2: number
}

export function getSnapIndicatorSegments(indicator: SnapIndicator, zoom: number): SnapLineSegment[] {
	if (indicator.type === 'points') {
		return [...getPointMainSegments(indicator), ...getPointCrosses(indicator, zoom)]
	}

	return getGapSegments(indicator, zoom)
}

function getPointMainSegments(indicator: PointsSnapIndicator): SnapLineSegment[] {
	const line = getPointLine(indicator)
	return line ? [{ id: `${indicator.id}:main`, ...line }] : []
}

function getPointCrosses(indicator: PointsSnapIndicator, zoom: number): SnapLineSegment[] {
	const length = 2.5 / zoom
	return indicator.points.flatMap((point, index) => [
		{
			id: `${indicator.id}:cross-a:${index}`,
			x1: point.x - length,
			y1: point.y - length,
			x2: point.x + length,
			y2: point.y + length,
		},
		{
			id: `${indicator.id}:cross-b:${index}`,
			x1: point.x - length,
			y1: point.y + length,
			x2: point.x + length,
			y2: point.y - length,
		},
	])
}

function getPointLine(indicator: PointsSnapIndicator) {
	const { points } = indicator
	if (points.length === 0) return null

	let minX = Infinity
	let maxX = -Infinity
	let minY = Infinity
	let maxY = -Infinity
	for (const point of points) {
		if (point.x < minX) minX = point.x
		if (point.x > maxX) maxX = point.x
		if (point.y < minY) minY = point.y
		if (point.y > maxY) maxY = point.y
	}

	const useNWtoSEdirection = points.some((point) => point.x === minX && point.y === minY)
	return useNWtoSEdirection
		? { x1: minX, y1: minY, x2: maxX, y2: maxY }
		: { x1: minX, y1: maxY, x2: maxX, y2: minY }
}

function getGapSegments(indicator: GapsSnapIndicator, zoom: number): SnapLineSegment[] {
	const { gaps, direction } = indicator
	if (gaps.length === 0) return []

	const horizontal = direction === 'horizontal'
	const length = 3.5 / zoom
	const tickLength = 2 * length
	let edgeIntersection = [-Infinity, Infinity] as [number, number]

	for (const gap of gaps) {
		const startIntersection = rangeIntersection(
			edgeIntersection[0],
			edgeIntersection[1],
			horizontal ? gap.startEdge[0].y : gap.startEdge[0].x,
			horizontal ? gap.startEdge[1].y : gap.startEdge[1].x
		)
		if (!startIntersection) continue
		edgeIntersection = startIntersection

		const endIntersection = rangeIntersection(
			edgeIntersection[0],
			edgeIntersection[1],
			horizontal ? gap.endEdge[0].y : gap.endEdge[0].x,
			horizontal ? gap.endEdge[1].y : gap.endEdge[1].x
		)
		if (!endIntersection) continue
		edgeIntersection = endIntersection
	}

	const midPoint = (edgeIntersection[0] + edgeIntersection[1]) / 2
	return gaps.flatMap(({ startEdge, endEdge }, index) => {
		if (horizontal) {
			const cx = (startEdge[0].x + endEdge[0].x) / 2
			return [
				{
					id: `${indicator.id}:start:${index}`,
					x1: startEdge[0].x,
					y1: midPoint - tickLength,
					x2: startEdge[1].x,
					y2: midPoint + tickLength,
				},
				{
					id: `${indicator.id}:end:${index}`,
					x1: endEdge[0].x,
					y1: midPoint - tickLength,
					x2: endEdge[1].x,
					y2: midPoint + tickLength,
				},
				{
					id: `${indicator.id}:join:${index}`,
					x1: startEdge[0].x,
					y1: midPoint,
					x2: endEdge[0].x,
					y2: midPoint,
				},
				{
					id: `${indicator.id}:center:${index}`,
					x1: cx,
					y1: midPoint - length,
					x2: cx,
					y2: midPoint + length,
				},
			]
		}

		const cy = (startEdge[0].y + endEdge[0].y) / 2
		return [
			{
				id: `${indicator.id}:start:${index}`,
				x1: midPoint - tickLength,
				y1: startEdge[0].y,
				x2: midPoint + tickLength,
				y2: startEdge[1].y,
			},
			{
				id: `${indicator.id}:end:${index}`,
				x1: midPoint - tickLength,
				y1: endEdge[0].y,
				x2: midPoint + tickLength,
				y2: endEdge[1].y,
			},
			{
				id: `${indicator.id}:join:${index}`,
				x1: midPoint,
				y1: startEdge[0].y,
				x2: midPoint,
				y2: endEdge[0].y,
			},
			{
				id: `${indicator.id}:center:${index}`,
				x1: midPoint - length,
				y1: cy,
				x2: midPoint + length,
				y2: cy,
			},
		]
	})
}
