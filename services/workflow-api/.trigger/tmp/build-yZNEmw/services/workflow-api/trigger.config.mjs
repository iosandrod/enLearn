import {
  defineConfig
} from "../../chunk-3DEPBX4X.mjs";
import "../../chunk-WTTQMZKM.mjs";
import "../../chunk-G4QPBQHR.mjs";
import "../../chunk-RDD7ZUEQ.mjs";
import "../../chunk-5XNG6EAY.mjs";
import "../../chunk-6RPNXJU4.mjs";
import {
  init_esm
} from "../../chunk-74TBADPG.mjs";

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
