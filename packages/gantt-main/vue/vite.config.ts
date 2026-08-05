import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => {
	const common = {
		plugins: [vue()],
		resolve: {
			dedupe: ["vue"],
		},
		test: {
			environment: "jsdom",
			setupFiles: [fromRoot("./test/setup.ts")],
			include: ["test/**/*.spec.ts"],
		},
	};

	if (mode === "demo") {
		return {
			...common,
			base: "./",
			build: {
				outDir: "dist-demo",
			},
		};
	}

	return {
		...common,
		build: {
			lib: {
				entry: fromRoot("./src/index.ts"),
				fileName: format =>
					format === "cjs" ? "index.cjs" : "index.es.js",
				formats: ["es", "cjs"],
			},
			rollupOptions: {
				external: ["vue", /^@svar-ui\//],
				output: {
					assetFileNames: "index.css",
				},
			},
		},
	};
});
