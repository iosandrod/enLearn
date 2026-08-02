import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const localPackageSrc = (name: string) =>
	fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))
const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const lowcodeFrameworkRoot = fileURLToPath(
	new URL('../lowcode-framework', import.meta.url)
)
const lowcodeFrameworkSrc = fileURLToPath(
	new URL('../lowcode-framework/src', import.meta.url)
)
const lowcodeFrameworkEntry = fileURLToPath(
	new URL('../lowcode-framework/src/index.ts', import.meta.url)
)
const dep = (name: string) => fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url))
const packageEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url))
const externalPackages = [
	'@enlearn/lowcode-framework',
	'@floating-ui/dom',
	'@tiptap/core',
	'@tiptap/pm',
	'@tiptap/react',
	'classnames',
	'eventemitter3',
	'idb',
	'is-plain-object',
	'lodash.isequal',
	'lodash.isequalwith',
	'lodash.throttle',
	'lodash.uniq',
	'qrcode',
	'rbush',
	'react',
	'react-dom',
	'vue',
	'vxe-pc-ui',
	'vxe-table',
]

const isExternalPackage = (id: string) =>
	externalPackages.some((name) => id === name || id.startsWith(`${name}/`))

export default defineConfig(({ mode }) => ({
	plugins: [vue()],
	resolve: {
		alias: [
			{ find: /^@enlearn\/lowcode-framework$/, replacement: lowcodeFrameworkEntry },
			{
				find: /^@enlearn\/lowcode-framework\/(.*)$/,
				replacement: `${lowcodeFrameworkSrc}/$1`,
			},
			{ find: /^~\/(.*)$/, replacement: `${lowcodeFrameworkSrc}/$1` },
			{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
			{
				find: '@tldraw/editor',
				replacement: fileURLToPath(new URL('./packages/editor/src/vue-core.ts', import.meta.url)),
			},
			{ find: '@tldraw/state', replacement: localPackageSrc('state') },
			{ find: '@tldraw/state-react', replacement: localPackageSrc('state-react') },
			{ find: '@tldraw/store', replacement: localPackageSrc('store') },
			{ find: '@tldraw/tlschema', replacement: localPackageSrc('tlschema') },
			{ find: '@tldraw/utils', replacement: localPackageSrc('utils') },
			{ find: '@tldraw/validate', replacement: localPackageSrc('validate') },
			{ find: '@floating-ui/dom', replacement: dep('@floating-ui/dom') },
			{ find: '@tiptap/core', replacement: dep('@tiptap/core') },
			{ find: '@tiptap/pm', replacement: dep('@tiptap/pm') },
			{ find: '@tiptap/react', replacement: dep('@tiptap/react') },
			{ find: 'classnames', replacement: dep('classnames') },
			{ find: 'eventemitter3', replacement: dep('eventemitter3') },
			{ find: 'idb', replacement: dep('idb') },
			{ find: 'is-plain-object', replacement: dep('is-plain-object') },
			{ find: 'lodash.isequal', replacement: dep('lodash.isequal') },
			{ find: 'lodash.isequalwith', replacement: dep('lodash.isequalwith') },
			{ find: 'lodash.throttle', replacement: dep('lodash.throttle') },
			{ find: 'lodash.uniq', replacement: dep('lodash.uniq') },
			{ find: 'rbush', replacement: dep('rbush') },
			{ find: 'react', replacement: dep('react') },
			{ find: 'react-dom/client', replacement: dep('react-dom/client.js') },
			{ find: 'react-dom', replacement: dep('react-dom') },
			{ find: 'vxe-pc-ui', replacement: dep('vxe-pc-ui') },
			{ find: 'vxe-table', replacement: dep('vxe-table') },
		],
		dedupe: ['vue', 'react', 'react-dom', 'vxe-pc-ui', 'vxe-table'],
	},
	server: {
		fs: {
			allow: [projectRoot, lowcodeFrameworkRoot],
		},
	},
	optimizeDeps: {
		include: [
			'react',
			'react-dom',
			'react-dom/client',
			'react/jsx-dev-runtime',
			'react/jsx-runtime',
			'vxe-pc-ui',
			'vxe-table',
			'vxe-table-plugin-extend-cell-area',
		],
		exclude: [
			'@enlearn/lowcode-framework',
			'@tldraw/editor',
			'@tldraw/state',
			'@tldraw/state-react',
			'@tldraw/store',
			'@tldraw/tlschema',
			'@tldraw/utils',
			'@tldraw/validate',
		],
	},
	build:
		mode === 'demo'
			? {
					outDir: 'dist-demo',
					emptyOutDir: true,
				}
			: {
					emptyOutDir: true,
					lib: {
						entry: packageEntry,
						formats: ['es', 'cjs'],
						fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
						cssFileName: 'style',
					},
					rollupOptions: {
						external: isExternalPackage,
						output: {
							exports: 'named',
						},
					},
				},
}))
