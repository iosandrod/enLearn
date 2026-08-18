import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

rmSync(resolve(process.cwd(), 'dist'), { recursive: true, force: true });
process.once('beforeExit', () => {
  const targetDirectory = resolve(process.cwd(), 'dist/planning-service/execution');
  mkdirSync(targetDirectory, { recursive: true });
  copyFileSync(
    resolve(process.cwd(), 'src/planning-service/execution/frepple-engine.py'),
    resolve(targetDirectory, 'frepple-engine.py')
  );
  copyFileSync(
    resolve(process.cwd(), 'src/planning-service/execution/frepple-sidecar.py'),
    resolve(targetDirectory, 'frepple-sidecar.py')
  );
});
