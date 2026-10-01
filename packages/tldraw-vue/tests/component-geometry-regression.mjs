import assert from 'node:assert/strict'
import { getVueBoxMarkSegments, getVueBoxPath } from '../src/editor/vueBoxGeometry.ts'

const geometries = [
  'rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'hexagon',
  'oval',
  'rhombus',
  'star',
  'cloud',
  'heart',
  'x-box',
  'check-box',
  'arrow-left',
  'arrow-up',
  'arrow-down',
  'arrow-right',
]

const paths = new Map(
  geometries.map((geometry) => [geometry, getVueBoxPath(geometry, 120, 76)])
)

for (const [geometry, path] of paths) {
  assert.match(path, /^M/, `${geometry} should start with a move command`)
  assert.match(path, /Z$/, `${geometry} should be a closed shape`)
  assert.doesNotMatch(path, /NaN|Infinity/, `${geometry} should contain finite coordinates`)
}

assert.notEqual(paths.get('ellipse'), paths.get('oval'), 'ellipse and oval need distinct geometry')
assert.notEqual(paths.get('diamond'), paths.get('rhombus'), 'diamond and rhombus need distinct geometry')
assert.notEqual(paths.get('rectangle'), paths.get('cloud'), 'cloud must not render as a rounded rectangle')
assert.match(paths.get('ellipse'), /A/, 'ellipse should use arc commands')
assert.match(paths.get('cloud'), /C/, 'cloud should use smooth curve commands')
assert.match(paths.get('heart'), /C/, 'heart should use smooth curve commands')

const squareRectangle = getVueBoxPath('rectangle', 120, 76, 0)
const roundedRectangle = getVueBoxPath('rectangle', 120, 76, 20)
assert.notEqual(squareRectangle, roundedRectangle, 'rectangle border radius must affect its path')
assert.match(squareRectangle, /^M0,0 /, 'a zero border radius must produce square corners')
assert.match(roundedRectangle, /^M20,0 /, 'the configured border radius must be used')

assert.equal(getVueBoxMarkSegments('x-box', 120, 76).length, 2)
assert.equal(getVueBoxMarkSegments('check-box', 120, 76).length, 2)
for (const geometry of geometries.filter((item) => item !== 'x-box' && item !== 'check-box')) {
  assert.equal(getVueBoxMarkSegments(geometry, 120, 76).length, 0, `${geometry} should not have a mark`)
}

console.log(`Verified ${geometries.length} component geometries.`)
