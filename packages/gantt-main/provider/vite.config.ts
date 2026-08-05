import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import dts from "vite-plugin-dts";
import { waitChanges, waitOn } from "@svar-ui/vite-tools";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(async ({ mode }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

	const files =
		mode === "production"
			? []
			: [fromRoot("../store/dist/index.js")];

	const config = {
		build: {
			lib: {
				entry: fromRoot("./src/index.ts"),
				name: "provider",
				formats: ["es"],
				fileName: () => `index.js`,
			},
			sourcemap: true,
			minify: false,
			target: "esnext",
		},
		test: {
			coverage: {
				provider: "v8" as const,
				reporter: ["text"],
			},
		},
		watch: {
			persistent: true,
			include: ["src/**/*.ts"],
		},
		plugins: [
			waitChanges({ files }),
			dts({ outDir: fromRoot("./dist/types") }),
		],
	};

	return waitOn({ files }).then(() => config);
});
