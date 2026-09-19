import type { VueGeoShape } from './interactions/types'

export interface VueBoxMarkSegment {
	x1: number
	y1: number
	x2: number
	y2: number
}

export function getVueBoxPath(geo: VueGeoShape, rawWidth: number, rawHeight: number) {
	const width = Math.max(1, rawWidth)
	const height = Math.max(1, rawHeight)

	switch (geo) {
		case 'ellipse':
			return ellipsePath(width, height)
		case 'oval':
			return roundedRectPath(width, height, Math.min(width, height) / 2)
		case 'triangle':
			return pointsToPath([[0.5, 0.04], [0.97, 0.96], [0.03, 0.96]], width, height)
		case 'diamond':
			return pointsToPath([[0.5, 0.03], [0.97, 0.5], [0.5, 0.97], [0.03, 0.5]], width, height)
		case 'rhombus':
			return pointsToPath([[0.23, 0.04], [0.98, 0.04], [0.77, 0.96], [0.02, 0.96]], width, height)
		case 'hexagon':
			return pointsToPath([[0.25, 0.03], [0.75, 0.03], [0.98, 0.5], [0.75, 0.97], [0.25, 0.97], [0.02, 0.5]], width, height)
		case 'star':
			return pointsToPath([
				[0.5, 0.02],
				[0.61, 0.35],
				[0.97, 0.35],
				[0.68, 0.56],
				[0.79, 0.91],
				[0.5, 0.7],
				[0.21, 0.91],
				[0.32, 0.56],
				[0.03, 0.35],
				[0.39, 0.35],
			], width, height)
		case 'cloud':
			return cloudPath(width, height)
		case 'heart':
			return heartPath(width, height)
		case 'arrow-left':
			return pointsToPath([[0.03, 0.5], [0.42, 0.08], [0.42, 0.31], [0.97, 0.31], [0.97, 0.69], [0.42, 0.69], [0.42, 0.92]], width, height)
		case 'arrow-up':
			return pointsToPath([[0.5, 0.03], [0.92, 0.42], [0.69, 0.42], [0.69, 0.97], [0.31, 0.97], [0.31, 0.42], [0.08, 0.42]], width, height)
		case 'arrow-down':
			return pointsToPath([[0.5, 0.97], [0.92, 0.58], [0.69, 0.58], [0.69, 0.03], [0.31, 0.03], [0.31, 0.58], [0.08, 0.58]], width, height)
		case 'arrow-right':
			return pointsToPath([[0.97, 0.5], [0.58, 0.08], [0.58, 0.31], [0.03, 0.31], [0.03, 0.69], [0.58, 0.69], [0.58, 0.92]], width, height)
		case 'x-box':
		case 'check-box':
		case 'rectangle':
		default:
			return roundedRectPath(width, height, Math.min(8, width * 0.12, height * 0.12))
	}
}

export function getVueBoxMarkSegments(
	geo: VueGeoShape,
	width: number,
	height: number
): VueBoxMarkSegment[] {
	if (geo === 'x-box') {
		return [
			{ x1: width * 0.32, y1: height * 0.24, x2: width * 0.68, y2: height * 0.76 },
			{ x1: width * 0.68, y1: height * 0.24, x2: width * 0.32, y2: height * 0.76 },
		]
	}

	if (geo === 'check-box') {
		return [
			{ x1: width * 0.25, y1: height * 0.5, x2: width * 0.42, y2: height * 0.67 },
			{ x1: width * 0.42, y1: height * 0.67, x2: width * 0.76, y2: height * 0.29 },
		]
	}

	return []
}

function pointsToPath(points: readonly (readonly [number, number])[], width: number, height: number) {
	return `${points
		.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x * width},${y * height}`)
		.join(' ')} Z`
}

function ellipsePath(width: number, height: number) {
	return `M${width / 2},0 A${width / 2},${height / 2} 0 1,1 ${width / 2},${height} A${width / 2},${height / 2} 0 1,1 ${width / 2},0 Z`
}

function roundedRectPath(width: number, height: number, radius: number) {
	const r = Math.min(radius, width / 2, height / 2)
	return `M${r},0 H${width - r} Q${width},0 ${width},${r} V${height - r} Q${width},${height} ${width - r},${height} H${r} Q0,${height} 0,${height - r} V${r} Q0,0 ${r},0 Z`
}

function cloudPath(width: number, height: number) {
	return [
		`M${width * 0.22},${height * 0.82}`,
		`C${width * 0.09},${height * 0.82} ${width * 0.02},${height * 0.7} ${width * 0.04},${height * 0.55}`,
		`C${width * 0.06},${height * 0.42} ${width * 0.15},${height * 0.34} ${width * 0.27},${height * 0.34}`,
		`C${width * 0.3},${height * 0.18} ${width * 0.42},${height * 0.08} ${width * 0.55},${height * 0.14}`,
		`C${width * 0.65},${height * 0.1} ${width * 0.76},${height * 0.17} ${width * 0.79},${height * 0.3}`,
		`C${width * 0.92},${height * 0.31} ${width * 0.99},${height * 0.43} ${width * 0.96},${height * 0.58}`,
		`C${width * 0.94},${height * 0.73} ${width * 0.84},${height * 0.82} ${width * 0.7},${height * 0.82}`,
		'Z',
	].join(' ')
}

function heartPath(width: number, height: number) {
	return [
		`M${width * 0.5},${height * 0.94}`,
		`C${width * 0.43},${height * 0.84} ${width * 0.08},${height * 0.63} ${width * 0.05},${height * 0.36}`,
		`C${width * 0.02},${height * 0.14} ${width * 0.18},${height * 0.03} ${width * 0.35},${height * 0.09}`,
		`C${width * 0.43},${height * 0.12} ${width * 0.48},${height * 0.18} ${width * 0.5},${height * 0.26}`,
		`C${width * 0.52},${height * 0.18} ${width * 0.57},${height * 0.12} ${width * 0.65},${height * 0.09}`,
		`C${width * 0.82},${height * 0.03} ${width * 0.98},${height * 0.14} ${width * 0.95},${height * 0.36}`,
		`C${width * 0.92},${height * 0.63} ${width * 0.57},${height * 0.84} ${width * 0.5},${height * 0.94}`,
		'Z',
	].join(' ')
}
