import { configuration } from './config.js';
import { createPrintServer } from './server.js';

const config = configuration();
const app = await createPrintServer(config);
try {
  await new Promise<void>((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(config.port, config.host, resolve);
  });
  console.log(`[api-print] http://${config.host}:${config.port}, ${config.workerCount} render workers, no authentication`);
} catch (error) { await app.close(); throw error; }

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await app.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
