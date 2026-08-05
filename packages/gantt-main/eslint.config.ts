import eslintConfigPrettier from "eslint-config-prettier";
import jsLint from "@eslint/js";
import tsLint from "typescript-eslint";
import vitest from "eslint-plugin-vitest";
import globals from "globals";

export default [
	{
		ignores: [
			"node_modules/",
			"**/dist/",
			"**/dist-demo/",
			"build/",
			"coverage/",
			"public/",
			"artifacts/",
		],
	},
	jsLint.configs.recommended,
	...tsLint.configs.recommended,
	eslintConfigPrettier,
	vitest.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
			ecmaVersion: 2022,
			sourceType: "module",
			parserOptions: {
				warnOnUnsupportedTypeScriptVersion: false,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"no-bitwise": "error",
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		files: ["**/*.spec.ts"],
		rules: {
			"@typescript-eslint/no-unused-expressions": "off",
			"vitest/valid-expect": "off",
			"vitest/expect-expect": "off",
		},
	},
];
