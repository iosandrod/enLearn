import assert from 'node:assert/strict'
import { createBarcodeSvgMarkup } from '../src/editor/extensions/barcode/barcodeSvg.ts'

const svg = createBarcodeSvgMarkup({
  w: 240,
  h: 96,
  text: '1234567890',
  format: 'code128',
  barColor: '#000000',
  background: '#ffffff',
  includeText: true,
  padding: 4,
  showBorder: false,
})

assert.match(svg, /^<svg /)
assert.match(svg, /viewBox="0 0 \d+ \d+"/)
assert.match(svg, /stroke="#000000"/)
assert.doesNotMatch(svg, /NaN|Infinity/)

console.log('Verified CODE128 barcode SVG generation.')
