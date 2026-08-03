import {
  defineConfig
} from "../chunk-ELK4KT3A.mjs";
import "../chunk-JAUVKWWZ.mjs";
import "../chunk-RD3PYEXF.mjs";
import "../chunk-3YJ5QEIB.mjs";
import "../chunk-LL72OHMD.mjs";
import "../chunk-4N4XZL7H.mjs";
import {
  init_esm
} from "../chunk-VDUEJNM7.mjs";

// trigger.config.ts
init_esm();
var trigger_config_default = defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  maxDuration: 3600,
  dirs: ["./src/workflow/trigger"],
  build: {}
});
var resolveEnvVars = void 0;
export {
  trigger_config_default as default,
  resolveEnvVars
};
//# sourceMappingURL=trigger.config.mjs.map
