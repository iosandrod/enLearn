import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	defineConfig,
	loadEnv,
	type PluginOption,
	type UserConfig,
} from "vite";
import dts from "vite-plugin-dts";
import conditionalCompile from "vite-plugin-conditional-compile";
import esbuild from "esbuild";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const minify: PluginOption = {
	name: "minify",
	closeBundle: () => {
		esbuild.buildSync({
			entryPoints: [fromRoot("./dist/index.js")],
			minify: true,
			allowOverwrite: true,
			outfile: fromRoot("./dist/index.js"),
		});
	},
};

export default defineConfig(({ mode }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd(), "WX") };
	const trial = !!process.env.WX_TRIAL_PACKAGE;
	const open = process.env.WX_PACKAGE_TYPE == "open";
	const isProduction = mode !== "development" && mode !== "test";

	const proSchedule = fromRoot("./src/pro/schedule-types.ts");
	const usePro = !open && existsSync(proSchedule);

	const config: UserConfig = {
		resolve: {
			alias: usePro
				? [
						{
							find: /^(.*\/)?schedule-types$/,
							replacement: proSchedule,
						},
					]
				: [],
		},
		build: {
			lib: {
				entry: fromRoot("./src/index.ts"),
				name: "store",
				formats: ["es"],
				fileName: () => `index.js`,
			},
			sourcemap: !trial,
			minify: isProduction,
			target: "esnext",
		},
		test: {
			coverage: {
				provider: "v8",
				reporter: ["text"],
			},
		},
		plugins: [],
	};

	if (isProduction) {
		config.plugins.push(conditionalCompile({}));
	}

	if (usePro) {
		config.plugins.push(
			dts({
				outDir: fromRoot("./dist/types"),
				afterBuild: () => {
					writeFileSync(
						fromRoot("./dist/types/schedule-types.d.ts"),
						'export * from "./pro/schedule-types";\n'
					);
				},
			})
		);
	} else {
		config.plugins.push(
			dts({
				outDir: fromRoot("./dist/types"),
				exclude: ["src/pro/**"],
			})
		);
	}

	if (isProduction) {
		config.plugins.push(minify);
	}

	return config;
});
