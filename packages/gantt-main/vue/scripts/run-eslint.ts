import { ESLint } from "eslint";
import config from "../eslint.config";

const eslint = new ESLint({
	baseConfig: config as any,
	overrideConfigFile: true,
});
const results = await eslint.lintFiles(process.argv.slice(2));
const formatter = await eslint.loadFormatter("stylish");
const output = await formatter.format(results);

if (output) process.stdout.write(output);
if (results.some(result => result.errorCount > 0)) process.exitCode = 1;
