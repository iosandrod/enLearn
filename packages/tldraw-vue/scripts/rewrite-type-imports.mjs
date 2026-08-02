import fs from 'node:fs'
import path from 'node:path'

const typesRoot = path.resolve('dist/types')
const exactAliases = new Map([
	['@tldraw/editor', 'packages/editor/src/vue-core'],
	['@tldraw/state', 'packages/state/src/index'],
	['@tldraw/state-react', 'packages/state-react/src/index'],
	['@tldraw/store', 'packages/store/src/index'],
	['@tldraw/tlschema', 'packages/tlschema/src/index'],
	['@tldraw/utils', 'packages/utils/src/index'],
	['@tldraw/validate', 'packages/validate/src/index'],
])
const prefixAliases = new Map([['@/', 'src/']])

function getDeclarationFiles(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	return entries.flatMap((entry) => {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) return getDeclarationFiles(fullPath)
		return entry.isFile() && entry.name.endsWith('.d.ts') ? [fullPath] : []
	})
}

function toRelativeSpecifier(fromFile, target) {
	let relative = path.relative(path.dirname(fromFile), path.join(typesRoot, target))
	relative = relative.replace(/\\/g, '/')
	if (!relative.startsWith('.')) relative = `./${relative}`
	return relative
}

function resolveAlias(specifier, fromFile) {
	const exactTarget = exactAliases.get(specifier)
	if (exactTarget) return toRelativeSpecifier(fromFile, exactTarget)

	for (const [prefix, targetPrefix] of prefixAliases) {
		if (specifier.startsWith(prefix)) {
			return toRelativeSpecifier(fromFile, `${targetPrefix}${specifier.slice(prefix.length)}`)
		}
	}

	return specifier
}

const specifierPattern = /((?:from\s+|import\s*\(\s*|declare\s+module\s+)['"])([^'"]+)(['"])/g

for (const file of getDeclarationFiles(typesRoot)) {
	const source = fs.readFileSync(file, 'utf8')
	const next = source.replace(specifierPattern, (match, before, specifier, after) => {
		return `${before}${resolveAlias(specifier, file)}${after}`
	})

	if (next !== source) {
		fs.writeFileSync(file, next)
	}
}
