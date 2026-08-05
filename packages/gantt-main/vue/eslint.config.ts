import js from "@eslint/js";
import globals from "globals";
import vue from "eslint-plugin-vue";

export default [
	{
		ignores: ["dist/", "dist-demo/"],
	},
	...vue.configs["flat/recommended"],
	{
		files: ["**/*.{ts,vue}"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: {
				...globals.browser,
				...globals.node,
			},
			sourceType: "module",
		},
		rules: {
			...js.configs.recommended.rules,
			"vue/attributes-order": "off",
			"vue/attribute-hyphenation": "off",
			"vue/block-order": ["error", { order: ["script", "template", "style"] }],
			"vue/html-indent": "off",
			"vue/html-self-closing": "off",
			"vue/max-attributes-per-line": "off",
			"vue/multi-word-component-names": "off",
			"vue/require-default-prop": "off",
			"vue/require-prop-types": "off",
			"vue/singleline-html-element-content-newline": "off"
		},
	},
];
