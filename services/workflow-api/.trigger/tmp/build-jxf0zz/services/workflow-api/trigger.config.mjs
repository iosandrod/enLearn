import {
  defineConfig
} from "../../chunk-XZEMTCXJ.mjs";
import "../../chunk-GIEEPZH6.mjs";
import "../../chunk-ESM3ZAKX.mjs";
import "../../chunk-PCODUAPY.mjs";
import "../../chunk-DCZJKOR4.mjs";
import "../../chunk-OVVJCK53.mjs";
import {
  init_esm
} from "../../chunk-65XIAWWW.mjs";

// trigger.config.ts
init_esm();
var trigger_config_default = defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  maxDuration: 3600,
  dirs: ["./src/trigger"],
  build: {}
});
var resolveEnvVars = void 0;
export {
  trigger_config_default as default,
  resolveEnvVars
};
//# sourceMappingURL=trigger.config.mjs.map
